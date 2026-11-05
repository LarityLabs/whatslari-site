import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { fileURLToPath } from 'node:url';
import { authorizationPhrase, appendDecisionEvent, buildCurrentApprovalManifest, createLegacyDecisionEvents, readDecisionEventLog, latestDecisionByScan } from './decision-history.mjs';
import { hashPublicContent, sha256 } from './publication-crypto.mjs';
import { recomputeSourceEntry } from './approval-validation.mjs';
import { scanPublicText } from './data-schema.mjs';

const root = path.resolve(process.env.LARI_SITE_ROOT || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'));
const privateDir = path.resolve(process.env.LARI_PRIVATE_REVIEW_DIR || path.join(root, 'private-review'));
const reportPath = process.env.LARI_REPORT_PATH && path.resolve(process.env.LARI_REPORT_PATH);
if (!reportPath) throw new Error('Set LARI_REPORT_PATH to the designated local source report.');
const scanPath = path.resolve(process.env.LARI_SCAN_OUTPUT_PATH || path.join(privateDir, 'research-scan.json'));
const queuePath = path.join(root, 'data/review-queue/records.json');
const approvalPath = path.join(privateDir, 'approval-manifest.json');
const decisionsPath = path.join(privateDir, 'research-decisions.json');
const historyPath = path.join(privateDir, 'decision-events.jsonl');
const reportText = await fs.readFile(reportPath, 'utf8');
const reportSha256 = sha256(reportText);
const sourceFingerprint = reportText.match(/Source fingerprint:\s*`?([a-f0-9]{64})/i)?.[1] || null;
if (!/^[a-f0-9]{64}$/i.test(reportSha256) || !/^[a-f0-9]{64}$/i.test(sourceFingerprint || '')) throw new Error('Review refused: source report SHA-256 or source fingerprint is unavailable.');
const scan = JSON.parse(await fs.readFile(scanPath, 'utf8'));
if (scan.source?.reportSha256 !== reportSha256 || scan.source?.sourceFingerprint !== sourceFingerprint) throw new Error('Review refused: private scan report identity is stale.');
let [queue, oldApproval, oldDecisions] = await Promise.all([
  fs.readFile(queuePath, 'utf8').then(JSON.parse),
  fs.readFile(approvalPath, 'utf8').then(JSON.parse),
  fs.readFile(decisionsPath, 'utf8').then(JSON.parse).catch(error => error.code === 'ENOENT' ? { schemaVersion: 1, decisions: [] } : Promise.reject(error))
]);
if (!Array.isArray(queue) || !Array.isArray(scan.entries)) throw new Error('Review queue or scan entries are malformed.');
const [approvalBytes, decisionsBytes] = await Promise.all([
  fs.readFile(approvalPath).catch(error => error.code === 'ENOENT' ? Buffer.from('{}\n') : Promise.reject(error)),
  fs.readFile(decisionsPath).catch(error => error.code === 'ENOENT' ? Buffer.from('{"schemaVersion":1,"decisions":[]}\n') : Promise.reject(error))
]);
const proposalPath = path.join(privateDir, 'launch-proposals.json');
let proposalBytes = Buffer.alloc(0), proposalManifest = null, editorialBytes = Buffer.alloc(0);
try {
  proposalBytes = await fs.readFile(proposalPath);
  proposalManifest = JSON.parse(proposalBytes.toString('utf8'));
  editorialBytes = await fs.readFile(path.join(privateDir, proposalManifest.editorialFile || 'LARI_LIVE_LAUNCH_REVIEW.md'));
} catch (error) {
  if (scan.entries.some(entry => entry.scanId?.startsWith('editorial-'))) throw new Error('Editorial source proposal is unavailable: ' + error.message);
}
const history = await readDecisionEventLog(historyPath);
if (history.errors.length) throw new Error('Decision history rejected: ' + history.errors.join('; '));
const ledgerEntries = (await fs.readFile(path.join(privateDir, 'research-ledger.jsonl'), 'utf8').catch(() => ''))
  .split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line));
const legacyEvents = history.events.length ? [] : createLegacyDecisionEvents({
  approval: oldApproval, decisions: oldDecisions, records: queue, ledgerEntries,
  approvalBytes: approvalBytes.toString('utf8'), decisionsBytes: decisionsBytes.toString('utf8')
});
const batchPath = process.env.LARI_REVIEW_INPUT_PATH ? path.resolve(process.env.LARI_REVIEW_INPUT_PATH) : null;
let batch = null;
if (batchPath) {
  const rel = path.relative(privateDir, batchPath);
  if (rel.startsWith('..') || path.isAbsolute(rel)) throw new Error('Batch review input must remain inside the designated private-review directory.');
  batch = JSON.parse(await fs.readFile(batchPath, 'utf8'));
  if (!Array.isArray(batch)) throw new Error('Batch review input must be a JSON array.');
}
const pipedLines = !process.stdin.isTTY ? fsSync.readFileSync(0, 'utf8').split(/\r?\n/) : null;
const rl = batch || pipedLines ? null : readline.createInterface({ input, output });
const ask = async (label, fallback = '') => {
  const prompt = `${label}${fallback ? ` [${fallback}]` : ''}: `;
  output.write(prompt);
  if (pipedLines) {
    if (!pipedLines.length || (pipedLines.length === 1 && !pipedLines[0])) throw new Error(`Standard input ended before: ${label}`);
    const value = pipedLines.shift().trim() || fallback;
    output.write(`${value}\n`);
    return value;
  }
  return (await rl.question('')).trim() || fallback;
};
const requestedIds = process.env.LARI_REVIEW_SCAN_IDS?.split(',').map(value => value.trim()).filter(Boolean) || null;
const entries = requestedIds ? scan.entries.filter(entry => requestedIds.includes(entry.scanId)) : scan.entries;
if (requestedIds && entries.length !== new Set(requestedIds).size) throw new Error('One or more requested scan IDs are absent or duplicated in the current scan.');
const actionsById = new Map((batch || []).map(item => [item.scanId, item]));
if (batch && (actionsById.size !== batch.length || batch.some(item => !entries.some(entry => entry.scanId === item.scanId)))) throw new Error('Batch review contains duplicate or unknown scan IDs.');
let reviewer = batch?.[0]?.reviewer || process.env.LARI_REVIEWER || '';
if (!reviewer && rl) reviewer = await ask('Reviewer name/handle');
if (!reviewer || typeof reviewer !== 'string') throw new Error('A reviewer identity is required.');

const allowedFields = new Set(['id','revision','collection','title','summary','researchQuestion','researchArea','researchAreas','architectureComponent','whyItMatters','status','verificationStatus','lifecycleStatus','sourceRecordId','measuredAt','evaluationMethod','baseline','candidateMethod','comparisonConditions','result','outcome','environment','externalModelUsage','coldReloadResult','causalAblationResult','transferResult','measurements','measurementConditions','limitations','relatedExperimentIds','relationships','publicProvenance','reportVersion','sourceFingerprint','publishedAt','lastReviewedAt']);
const atomicWrite = async (filePath, bytes) => {
  const temp = filePath + '.' + crypto.randomUUID() + '.tmp';
  await fs.writeFile(temp, bytes, { flag: 'wx' });
  await fs.rename(temp, filePath);
};
const archiveLegacy = async (name, bytes) => {
  const archivePath = path.join(privateDir, name);
  try { await fs.writeFile(archivePath, bytes, { flag: 'wx' }); }
  catch (error) {
    if (error.code !== 'EEXIST') throw error;
    if (sha256(await fs.readFile(archivePath)) !== sha256(bytes)) throw new Error(`Existing ${name} archive differs from the pre-migration source; refusing to overwrite it.`);
  }
};

try {
  for (const entry of entries) {
    const inputRow = actionsById.get(entry.scanId);
    const action = inputRow?.action || (rl || pipedLines ? await ask(`Action for ${entry.scanId}: approve / edit / reject / defer / verify / stop`, 'defer') : 'defer').toLowerCase();
    if (action === 'stop') break;
    const map = { approve: 'approved', edit: 'approved-edited', reject: 'rejected', defer: 'deferred', verify: 'verification-requested' };
    if (!map[action]) throw new Error(`Unsupported review action for ${entry.scanId}: ${action}`);
    let disposition = map[action];
    let record = null;
    let contentHash = null;
    let auth = { method: batch ? 'batch-test-input-not-owner-authorization' : 'interactive-exact-identity-confirmation', channel: batch ? 'batch-test' : 'interactive-console', phraseMatched: false, expectedPhrase: null, acceptedPhrase: null };
    if (action === 'approve' || action === 'edit') {
      const draft = entry.reviewDraft;
      if (!draft || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(draft.id || '')) throw new Error(`${entry.scanId} has no source-backed stable public ID.`);
      const existing = queue.find(item => item.id === draft.id);
      if (existing && existing.collection !== draft.collection) throw new Error(`${entry.scanId} public type differs from the staged stable ID.`);
      record = action === 'edit' ? inputRow?.record : (existing || draft);
      if (!record && (rl || pipedLines)) record = JSON.parse(await ask('Edited public record JSON'));
      if (!record || record.id !== draft.id || record.collection !== draft.collection) throw new Error('Review must preserve the exact stable record ID and public collection.');
      if (Object.keys(record).some(key => !allowedFields.has(key))) throw new Error('Reviewed record has fields outside the public allowlist.');
      const privacy = scanPublicText(record);
      if (privacy.length) throw new Error('Privacy gate rejected record before authorization: ' + privacy.join('; '));
      if (entry.approvalBlockedReason || entry.references?.some(ref => !ref.exists)) throw new Error(`Source evidence is blocked for ${entry.scanId}: ${entry.approvalBlockedReason || 'unresolved reference'}`);
      const sourceCheck = await recomputeSourceEntry({ entry, reportText, sourceRoot: path.dirname(reportPath), proposalManifest, proposalBytes, editorialBytes });
      if (sourceCheck.errors.length) throw new Error(`Source binding failed for ${entry.scanId}: ${sourceCheck.errors.join('; ')}`);
      record = { ...record };
      contentHash = hashPublicContent(record);
      const expected = authorizationPhrase({ recordId: record.id, sourceReportSha256: reportSha256, approvedContentSha256: contentHash });
      const accepted = inputRow?.authorizationPhrase ?? (rl || pipedLines ? await ask(`Type exact current-source authorization: ${expected}`) : '');
      auth = { method: batch ? 'batch-test-input-not-owner-authorization' : 'local-cli-exact-identity-confirmation', channel: batch ? 'batch-test' : process.stdin.isTTY ? 'interactive-console' : 'explicit-stdin', phraseMatched: accepted === expected, expectedPhrase: expected, acceptedPhrase: accepted };
      if (!auth.phraseMatched) { disposition = 'deferred'; record = null; contentHash = null; }
    }
    const reviewedAt = new Date().toISOString();
    const eventData = {
      recordId: entry.reviewDraft?.id || inputRow?.recordId || 'scan-' + entry.scanId,
      scanId: entry.scanId,
      sourceReportSha256: reportSha256,
      sourceFingerprint,
      sectionSha256: entry.sectionSha256,
      evidenceDigest: entry.evidenceDigest,
      evidenceReferences: entry.references || [],
      approvedContentSha256: contentHash,
      collection: record?.collection || entry.reviewDraft?.collection || null,
      decision: disposition,
      decisionTimestamp: reviewedAt,
      reviewer,
      explicitCurrentSourceAuthorization: ['approved','approved-edited'].includes(disposition) && auth.phraseMatched,
      authorization: auth,
      note: inputRow?.note || null
    };
    if (!history.events.length && legacyEvents.length) {
      await archiveLegacy('approval-manifest.legacy-v2.json', approvalBytes);
      await archiveLegacy('research-decisions.legacy-v1.json', decisionsBytes);
    }
    const events = await appendDecisionEvent({ filePath: historyPath, legacyEvents: history.events.length ? [] : legacyEvents, eventData });
    if (record) {
      const index = queue.findIndex(item => item.id === record.id);
      if (index >= 0) queue[index] = record;
      else queue.push(record);
      await atomicWrite(queuePath, `${JSON.stringify(queue, null, 2)}\n`);
    }
    const latest = latestDecisionByScan(events);
    const currentDecisions = { schemaVersion: 2, sourceReportSha256: reportSha256, sourceFingerprint, decisions: [...latest.values()] };
    await atomicWrite(path.join(privateDir, 'research-decisions-current.json'), `${JSON.stringify(currentDecisions, null, 2)}\n`);
    const manifest = buildCurrentApprovalManifest({ events, records: queue, reportSha256, sourceFingerprint, historyRelativePath: 'decision-events.jsonl' });
    await atomicWrite(approvalPath, `${JSON.stringify(manifest, null, 2)}\n`);
    output.write(`${entry.scanId}: ${disposition}${auth.phraseMatched ? ' (current source and content explicitly authorized)' : ''}\n`);
  }
} finally { rl?.close(); }

process.stdout.write('Append-only review history saved. The manifest is a derived projection; export was not invoked.\n');
