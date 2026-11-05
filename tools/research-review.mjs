import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { fileURLToPath } from 'node:url';
import { hashPublicContent } from './approval-validation.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const privateDir = path.join(root, 'private-review');
const scan = JSON.parse(await fs.readFile(path.join(privateDir, 'research-scan.json'), 'utf8'));
const rl = readline.createInterface({ input, output });
const batchInputPath = process.env.LARI_REVIEW_INPUT_PATH ? path.resolve(process.env.LARI_REVIEW_INPUT_PATH) : null;
let batchLines = null;
let batchIndex = 0;
if (batchInputPath) {
  const relative = path.relative(privateDir, batchInputPath);
  if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('Batch review input must remain inside ignored private-review.');
  batchLines = (await fs.readFile(batchInputPath, 'utf8')).split(/\r?\n/);
}
const prompt = async (label, fallback = '') => {
  const promptText = `${label}${fallback ? ` [${fallback}]` : ''}: `;
  if (!batchLines) return (await rl.question(promptText)).trim() || fallback;
  if (batchIndex >= batchLines.length) throw new Error(`Private batch review input ended before: ${label}`);
  output.write(promptText);
  const value = batchLines[batchIndex++].trim();
  output.write(`${value || fallback}\n`);
  return value || fallback;
};
const decisionsPath = path.join(privateDir, 'research-decisions.json');
const decisions = JSON.parse(await fs.readFile(decisionsPath, 'utf8').catch(() => '{"schemaVersion":1,"decisions":[]}'));
const prior = new Map(decisions.decisions.map(item => [item.scanId, item]));
const queuePath = path.join(root, 'data/review-queue/records.json');
const queue = JSON.parse(await fs.readFile(queuePath, 'utf8'));
const approvalPath = path.join(privateDir, 'approval-manifest.json');
const approval = JSON.parse(await fs.readFile(approvalPath, 'utf8'));
let reviewer = await prompt('Reviewer name/handle', approval.approver || '');
if (!reviewer) throw new Error('A reviewer identity is required.');
let processed = 0;
const requestedIds = process.env.LARI_REVIEW_SCAN_IDS?.split(',').map(value => value.trim()).filter(Boolean) || null;
const reviewEntries = requestedIds ? scan.entries.filter(entry => requestedIds.includes(entry.scanId)) : scan.entries;
if (requestedIds) {
  const found = new Set(reviewEntries.map(entry => entry.scanId));
  const missing = requestedIds.filter(id => !found.has(id));
  if (missing.length) throw new Error(`Requested scan IDs are not in the current private scan: ${missing.join(', ')}`);
}
try {
  for (const entry of reviewEntries) {
    if (prior.get(entry.scanId)?.sectionSha256 === entry.sectionSha256 && prior.get(entry.scanId)?.evidenceDigest === entry.evidenceDigest && prior.get(entry.scanId)?.disposition && prior.get(entry.scanId).disposition !== 'new-for-review') continue;
    output.write(`\n${'='.repeat(76)}\n${entry.title}\nScan ID ${entry.scanId} · ${entry.date || 'date unknown'} · ${entry.reportStatus}\nEvidence refs: ${entry.references.length}; resolved: ${entry.references.filter(r => r.exists).length}; report section hash: ${entry.sectionSha256}; evidence set hash: ${entry.evidenceDigest}\n\n${entry.excerpt.slice(0, 1800)}\n`);
    for (const ref of entry.references) output.write(`  ${ref.exists ? 'RESOLVED' : 'MISSING'} · ${ref.ref}${ref.sha256 ? ` · sha256 ${ref.sha256}` : ''}\n`);
    const action = (await prompt('Action: [a]pprove / [e]dit+approve / [r]eject / [d]efer / [v]erify / [s]top', 'd')).toLowerCase();
    if (action === 's') break;
    if (!['a','e','r','d','v'].includes(action)) { output.write('No decision recorded for this item.\n'); continue; }
    let decision = { scanId: entry.scanId, title: entry.title, sectionSha256: entry.sectionSha256, evidenceDigest:entry.evidenceDigest, sourceFingerprint: scan.source.sourceFingerprint, sourceReportSha256: scan.source.reportSha256, reviewedAt: new Date().toISOString(), reviewer, authorization: process.env.LARI_REVIEW_AUTHORIZATION || null, disposition: ({a:'approved',e:'approved-edited',r:'rejected',d:'deferred',v:'verification-requested'})[action] };
    if (action === 'a' || action === 'e') {
      if (entry.approvalBlockedReason) { decision.disposition='verification-requested'; decision.note=entry.approvalBlockedReason; prior.set(entry.scanId,decision); output.write(`Approval blocked pending evidence reconciliation: ${entry.approvalBlockedReason}\n`); processed++; continue; }
      const draft = entry.reviewDraft || {};
      const idFallback = draft.id || entry.title.toLowerCase().replace(/\b20\d{2}[^ ]*/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,56) || entry.scanId;
      const title = await prompt('Public title', draft.title || entry.title);
      const summary = await prompt('Public summary (write narrow, evidence-bounded wording)', draft.summary || '');
      const limitations = await prompt('Limitations / what this does not establish', draft.limitations || '');
      const collection = await prompt('Collection (experiments/capabilities/milestones/metrics)', draft.collection || 'experiments');
      const status = await prompt('Result status (hypothesis/experimental/demonstrated/independently-reproduced/production-qualified/negative-result)', draft.status || 'experimental');
      const verificationStatus = await prompt('Verification (unverified/verified/independently-reproduced/not-applicable)', draft.verificationStatus || 'unverified');
      const evaluationMethod = await prompt('Evaluation method', draft.evaluationMethod || '');
      const sourceRecordId = await prompt('Public provenance label (no paths or internal IDs)', draft.sourceRecordId || '');
      const researchQuestion = await prompt('Research question (blank if not known)', draft.researchQuestion || '');
      const researchArea = await prompt('Research area (blank if not classified)', draft.researchArea || '');
      const researchAreas = (await prompt('Additional research areas, comma-separated (blank if none)', (draft.researchAreas || []).join(', '))).split(',').map(value => value.trim()).filter(Boolean);
      const revisionInput = await prompt('Record revision (positive integer)', String(draft.revision || 1));
      const revision = Number(revisionInput);
      if (!Number.isSafeInteger(revision) || revision < 1) throw new Error('Record revision must be a positive integer.');
      const architectureComponent = await prompt('Architecture component (request/kernel/state/execution/persistence/governance; blank if no proven link)', draft.architectureComponent || '');
      const whyItMatters = await prompt('Why this question matters (blank if unknown)', draft.whyItMatters || '');
      const baseline = await prompt('Initial baseline (blank if unavailable)', draft.baseline || '');
      const candidateMethod = await prompt('Candidate method (blank if unavailable)', draft.candidateMethod || '');
      const comparisonConditions = await prompt('Comparison conditions (blank if unavailable)', draft.comparisonConditions || '');
      const result = await prompt('Observed result (blank if summary is sufficient)', draft.result || '');
      const outcome = await prompt('Outcome label/description (blank if unavailable)', draft.outcome || '');
      const environment = await prompt('Test environment (blank if unavailable)', draft.environment || '');
      const externalModelUsage = await prompt('External model usage (blank if unknown)', draft.externalModelUsage || '');
      const coldReloadResult = await prompt('Cold-reload result (blank if not measured)', draft.coldReloadResult || '');
      const causalAblationResult = await prompt('Causal ablation result (blank if not measured)', draft.causalAblationResult || '');
      const transferResult = await prompt('Transfer result (blank if not measured)', draft.transferResult || '');
      const lifecycleStatus = await prompt('Lifecycle status (active/candidate/historical/failed/withdrawn/planned/unknown)', draft.lifecycleStatus || 'unknown');
      const measurementInput = await prompt('Measurements as name=value pairs separated by semicolons (blank if none)', Object.entries(draft.measurements || {}).map(([key,value]) => `${key}=${value}`).join(';'));
      const measurements = Object.fromEntries(measurementInput.split(';').map(item => item.trim()).filter(Boolean).map(item => {
        const separator = item.indexOf('='); if (separator < 1) throw new Error('Measurements must use name=value; separate multiple values with semicolons.');
        const name = item.slice(0, separator).trim(), raw = item.slice(separator + 1).trim();
        if (!/^[A-Za-z][A-Za-z0-9]*$/.test(name)) throw new Error(`Invalid measurement name: ${name}`);
        return [name, raw === 'true' ? true : raw === 'false' ? false : raw !== '' && Number.isFinite(Number(raw)) ? Number(raw) : raw];
      }));
      const measurementConditions = Object.keys(measurements).length === 0 ? null : await prompt('Measurement conditions / denominator / run scope', draft.measurementConditions || '');
      const relatedExperimentIds = (await prompt('Related public record IDs, comma-separated (blank if none)', (draft.relatedExperimentIds || []).join(', '))).split(',').map(v => v.trim()).filter(Boolean);
      const relationships = (await prompt('Relationships as type:id pairs separated by commas (blank if none)', (draft.relationships || []).map(item => `${item.type}:${item.recordId}`).join(', '))).split(',').map(v => v.trim()).filter(Boolean).map(v => { const [type, ...rest] = v.split(':'); return { type, recordId:rest.join(':') }; });
      const publicProvenance = await prompt('Public-safe provenance statement (no paths, hashes, or internal IDs)', draft.publicProvenance || '');
      if (![title, summary, limitations, evaluationMethod, sourceRecordId, publicProvenance].every(Boolean) || !['experiments','capabilities','milestones','metrics'].includes(collection)) throw new Error('Approval requires reviewed title, summary, limitations, evaluation method, public provenance, and a valid collection.');
      if (!['hypothesis','experimental','demonstrated','independently-reproduced','production-qualified','negative-result'].includes(status)) throw new Error('Choose a supported result status.');
      if (!['unverified','verified','independently-reproduced','not-applicable'].includes(verificationStatus)) throw new Error('Choose a supported verification label.');
      if (!['active','candidate','historical','failed','withdrawn','planned','unknown'].includes(lifecycleStatus)) throw new Error('Choose a supported lifecycle status.');
      if (architectureComponent && !['request','kernel','state','execution','persistence','governance'].includes(architectureComponent)) throw new Error('Choose an existing architecture component or leave blank.');
      const id = await prompt('Stable public ID', idFallback);
      const record = {
        id, revision, collection, title, summary, researchQuestion:researchQuestion || null, researchArea:researchArea || null, researchAreas, architectureComponent:architectureComponent || null,
        whyItMatters:whyItMatters || null, status, verificationStatus, lifecycleStatus,
        sourceRecordId, measuredAt: entry.date || 'unknown', evaluationMethod,
        baseline:baseline || null, candidateMethod:candidateMethod || null, comparisonConditions:comparisonConditions || null,
        result:result || null, outcome:outcome || null, environment:environment || null, externalModelUsage:externalModelUsage || null, coldReloadResult:coldReloadResult || null,
        causalAblationResult:causalAblationResult || null, transferResult:transferResult || null, measurements, measurementConditions,
        limitations, relatedExperimentIds, relationships, publicProvenance,
        reportVersion: `LARI Full Report ${scan.source.generatedAt || 'date unknown'}`, sourceFingerprint: null,
        publishedAt: null, lastReviewedAt: decision.reviewedAt
      };
      output.write(`\nEXACT PUBLIC RECORD PREVIEW (this is what export will publish):\n${JSON.stringify(record,null,2)}\n\nPRIVATE-ONLY AND OMITTED: raw report excerpts, absolute source paths, internal IDs, local evidence hashes, scan decisions, and unapproved candidate details.\n`);
      const confirmed = (await prompt(`Type APPROVE ${id} to add this one reviewed record to the private staging queue`)).trim();
      if (confirmed !== `APPROVE ${id}`) { decision.disposition = 'deferred'; decision.note = 'Explicit confirmation phrase did not match.'; }
      else {
        const recordHash = hashPublicContent(record);
        decision.recordId = id;
        decision.approvedContentSha256 = recordHash;
        const index = queue.findIndex(item => item.id === id);
        if (index >= 0) queue[index] = record;
        else queue.push(record);
        approval.status = 'approved'; approval.schemaVersion = 2; approval.approver = reviewer; approval.approvedAt = decision.reviewedAt;
        approval.recordIds = [...new Set([...(approval.recordIds || []), id])];
        approval.sourceReportSha256 = scan.source.reportSha256;
        approval.sourceFingerprint = scan.source.sourceFingerprint;
        approval.records = [...(approval.records || []).filter(item => item.recordId !== id), { recordId: id, scanId: entry.scanId, sectionSha256: entry.sectionSha256, evidenceDigest:entry.evidenceDigest, approvedContentSha256: recordHash, sourceFingerprint: scan.source.sourceFingerprint, sourceReportSha256: scan.source.reportSha256, reviewedAt: decision.reviewedAt, reviewer, authorization: decision.authorization, decision: decision.disposition }];
        if (decision.authorization) approval.authorization = decision.authorization;
        output.write(`\nRecord ${id} staged as individually reviewed. It is not public until the explicit export command is run.\n`);
      }
    }
    prior.set(entry.scanId, decision); processed++;
  }
  decisions.decisions = [...prior.values()];
  await fs.writeFile(decisionsPath, `${JSON.stringify(decisions,null,2)}\n`);
  if (queue.length) {
    await fs.writeFile(queuePath, `${JSON.stringify(queue,null,2)}\n`);
    await fs.writeFile(approvalPath, `${JSON.stringify(approval,null,2)}\n`);
  }
  output.write(`\nSaved ${processed} review decision(s) privately. Candidate generation itself never approves records.\n`);
} finally { rl.close(); }
