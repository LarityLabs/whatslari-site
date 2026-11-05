import fs from 'node:fs/promises';
import path from 'node:path';
import { hashPublicContent, sha256, stableStringify } from './publication-crypto.mjs';

export const EXPECTED_EDITORIAL_RECORD_IDS = [
  'blank-workspace-javascript-construction',
  'milestone-blank-workspace-javascript-construction',
  'go-planner-research-to-construction',
  'milestone-go-planner-negative-result',
  'stateful-relational-induction',
  'milestone-stateful-relational-induction',
  'five-bounded-coding-lanes',
  'capability-five-bounded-coding-lanes',
  'milestone-five-bounded-coding-lanes',
  'recap-bounded-language-and-composition',
  'capability-recap-bounded-language',
  'milestone-recap-bounded-language',
  'learning-state-verification-and-rollback',
  'capability-candidate-qualification-governance',
  'milestone-candidate-qualification-governance'
];

export function extractReportIdentity(reportText) {
  const reportSha256 = sha256(reportText);
  const sourceFingerprint = reportText.match(/Source fingerprint:\s*`?([a-f0-9]{64})/i)?.[1] || null;
  const generatedAt = reportText.match(/Generated:\s*`?([^\r\n`]+)/i)?.[1]?.trim() || null;
  return { reportSha256, sourceFingerprint, generatedAt };
}

export function extractReportSections(reportText) {
  const headings = [...reportText.matchAll(/^(#{2,4})\s+(.+)$/gm)];
  return headings.map((match, index) => ({
    title: match[2].trim(),
    start: match.index + match[0].length,
    end: headings[index + 1]?.index ?? reportText.length
  }));
}

export function getSectionByTitle(reportText, title) {
  const matches = extractReportSections(reportText).filter(section => section.title === title);
  if (matches.length !== 1) return { count: matches.length, section: null, body: null, sectionSha256: null };
  const body = reportText.slice(matches[0].start, matches[0].end).trim();
  return { count: 1, section: matches[0], body, sectionSha256: sha256(body) };
}

function reportLinks(body) {
  return [...new Set([...body.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)].map(match => match[1]).filter(ref => !/^https?:/i.test(ref)))];
}

export async function resolveEvidenceReferences(refs, sourceRoot) {
  const resolutions = [];
  for (const ref of [...new Set(refs)]) {
    let resolved;
    try { resolved = path.resolve(sourceRoot, decodeURIComponent(ref.split('#')[0]).replaceAll('/', path.sep)); }
    catch { resolutions.push({ ref, exists: false, reason: 'invalid encoded source reference' }); continue; }
    const relative = path.relative(sourceRoot, resolved);
    if (relative.startsWith('..') || path.isAbsolute(relative)) {
      resolutions.push({ ref, exists: false, reason: 'reference escapes designated source root' });
      continue;
    }
    try {
      const stat = await fs.stat(resolved);
      const isFile = stat.isFile();
      const isDirectory = stat.isDirectory();
      if (!isFile && !isDirectory) { resolutions.push({ ref, exists: false, reason: 'reference is not a file or directory' }); continue; }
      const bytes = isFile ? await fs.readFile(resolved) : null;
      resolutions.push({
        ref, exists: true, type: isFile ? 'file' : 'directory', bytes: isFile ? stat.size : null,
        sha256: isFile ? sha256(bytes) : null,
        reason: isDirectory ? 'directory reference resolved; directory contents are not indexed' : null
      });
    } catch {
      resolutions.push({ ref, exists: false, reason: 'not found at source verification time' });
    }
  }
  return resolutions;
}

export function referenceTuples(references) {
  return references.map(ref => [ref.ref, ref.exists, ref.sha256 || null, ref.reason || null]).sort((left, right) => left[0].localeCompare(right[0]));
}

export function evidenceReferenceSetsMatch(left, right) {
  return stableStringify(referenceTuples(left || [])) === stableStringify(referenceTuples(right || []));
}

export function expandEditorialRecords(proposals) {
  const rows = [];
  for (const story of proposals.records || []) {
    for (const [publicationKind, record] of [
      ['experiment', story.record],
      ['capability', story.capabilityDraft],
      ['milestone', story.milestoneDraft]
    ]) {
      if (record) rows.push({ publicationKind, story, record });
    }
  }
  return rows;
}

function finalizePlan(plan) {
  const { planSha256: _ignored, ...body } = plan;
  plan.planSha256 = sha256(stableStringify(body));
  return plan;
}

export async function buildRebindingPlan({ reportText, sourceRoot, proposalBytes, editorialBytes, approval, records, ledgerEntries }) {
  const identity = extractReportIdentity(reportText);
  const proposalText = Buffer.from(proposalBytes).toString('utf8');
  const proposals = JSON.parse(proposalText);
  const editorialText = Buffer.from(editorialBytes).toString('utf8');
  const proposalDigest = sha256(Buffer.concat([Buffer.from(proposalBytes), Buffer.from(editorialBytes)]));
  const recordById = new Map();
  for (const row of records || []) {
    if (!row?.id || recordById.has(row.id)) recordById.set(row?.id, null);
    else recordById.set(row.id, row);
  }
  const receiptById = new Map((approval?.records || []).map(row => [row.recordId, row]));
  const sourceSections = extractReportSections(reportText);
  const rows = expandEditorialRecords(proposals);
  const seen = new Set();
  const items = [];

  for (const { story, record, publicationKind } of rows) {
    const id = record?.id;
    seen.add(id);
    const reasons = [];
    const receipt = receiptById.get(id);
    const queued = recordById.get(id);
    const sectionMatches = sourceSections.filter(section => section.title.toLowerCase().includes(String(story.reportSectionIncludes || '').toLowerCase()));
    const section = sectionMatches.length === 1 ? sectionMatches[0] : null;
    const body = section ? reportText.slice(section.start, section.end).trim() : null;
    const sectionSha256 = body === null ? null : sha256(body);
    const selectedRefs = [...new Set((story.evidenceRefs || []).length ? story.evidenceRefs : (body ? reportLinks(body) : []))];
    const currentReferences = body === null ? [] : await resolveEvidenceReferences(selectedRefs, sourceRoot);
    const currentContentSha256 = queued ? hashPublicContent({ ...queued, publishedAt: null }) : null;
    const oldLedger = receipt ? [...ledgerEntries].reverse().find(entry => entry.scanId === receipt.scanId && entry.sectionSha256 === receipt.sectionSha256 && entry.evidenceDigest === receipt.evidenceDigest) : null;
    const tests = {
      uniqueStableRecord: typeof id === 'string' && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id) && !!record?.collection,
      uniqueCurrentSection: sectionMatches.length === 1,
      sourceSectionUnchanged: !!receipt && !!sectionSha256 && receipt.sectionSha256 === sectionSha256,
      declaredEvidenceResolved: currentReferences.length === selectedRefs.length && currentReferences.every(ref => ref.exists && ref.type === 'file' && /^[a-f0-9]{64}$/i.test(ref.sha256 || '')),
      declaredEvidenceUnchanged: !!oldLedger && evidenceReferenceSetsMatch(oldLedger.references, currentReferences),
      approvedPublicContentPresent: !!queued && !!receipt,
      approvedPublicContentUnchanged: !!queued && !!receipt && currentContentSha256 === receipt.approvedContentSha256,
      publicTypeUnchanged: !!queued && !!record && queued.collection === record.collection,
      oldApprovalIdentityPresent: !!receipt && !!receipt.sourceReportSha256 && !!receipt.sourceFingerprint
    };
    if (!tests.uniqueStableRecord) reasons.push('stable public record ID or publication type is invalid');
    if (sectionMatches.length !== 1) reasons.push('expected exactly one source section; found ' + sectionMatches.length);
    if (receipt && sectionSha256 && receipt.sectionSha256 !== sectionSha256) reasons.push('source section content changed');
    if (!receipt) reasons.push('old approval receipt is absent');
    if (!oldLedger) reasons.push('old ledger row matching the approval hashes is absent');
    if (currentReferences.some(ref => !ref.exists)) reasons.push('one or more declared evidence references are unresolved');
    if (oldLedger && !evidenceReferenceSetsMatch(oldLedger.references, currentReferences)) reasons.push('declared evidence reference set or file hash changed');
    if (!queued) reasons.push('approved public record is missing or duplicated in the review queue');
    if (queued && receipt && currentContentSha256 !== receipt.approvedContentSha256) reasons.push('approved public content or claim scope changed');
    if (queued && record && queued.collection !== record.collection) reasons.push('public record type differs from its editorial proposal');
    if (receipt && (!receipt.sourceReportSha256 || !receipt.sourceFingerprint)) reasons.push('old approval source identity is incomplete');
    const unresolved = sectionMatches.length !== 1 || !receipt || !oldLedger || !queued || !tests.declaredEvidenceResolved || !tests.oldApprovalIdentityPresent || !tests.uniqueStableRecord;
    const changed = !unresolved && Object.entries(tests).some(([key, value]) => !value && key !== 'declaredEvidenceResolved');
    items.push({
      recordId: id, scanId: 'editorial-' + id, publicationKind, collection: record?.collection || null,
      title: record?.title || null, oldSourceReportSha256: receipt?.sourceReportSha256 || null,
      oldSourceFingerprint: receipt?.sourceFingerprint || null, newSourceReportSha256: identity.reportSha256,
      newSourceFingerprint: identity.sourceFingerprint, sectionTitle: section?.title || null,
      oldSectionSha256: receipt?.sectionSha256 || null, newSectionSha256: sectionSha256,
      oldEvidenceDigest: receipt?.evidenceDigest || null, priorEvidenceReferences: oldLedger?.references || [],
      currentEvidenceReferences: currentReferences, oldApprovedContentSha256: receipt?.approvedContentSha256 || null,
      currentApprovedContentSha256: currentContentSha256, tests, classification: unresolved ? 'unresolved-lineage' : changed ? 'changed-evidence' : 'unchanged-evidence', reasons
    });
  }
  const missingIds = EXPECTED_EDITORIAL_RECORD_IDS.filter(id => !seen.has(id));
  const unexpectedIds = [...seen].filter(id => !EXPECTED_EDITORIAL_RECORD_IDS.includes(id));
  for (const id of missingIds) items.push({ recordId: id, scanId: 'editorial-' + id, classification: 'unresolved-lineage', reasons: ['P1 stable public record is omitted from the current proposal set'] });
  for (const id of unexpectedIds) items.push({ recordId: id, scanId: 'editorial-' + id, classification: 'unresolved-lineage', reasons: ['proposal contains a record outside the P1 stable-ID crosswalk'] });
  const counts = {
    unchangedEvidence: items.filter(item => item.classification === 'unchanged-evidence').length,
    changedEvidence: items.filter(item => item.classification === 'changed-evidence').length,
    unresolvedLineage: items.filter(item => item.classification === 'unresolved-lineage').length
  };
  const overallStatus = counts.unchangedEvidence === EXPECTED_EDITORIAL_RECORD_IDS.length && counts.changedEvidence === 0 && counts.unresolvedLineage === 0
    ? 'ready-to-rebind-proposals; owner reauthorization still required'
    : 'blocked; changed or unresolved records require review';
  return finalizePlan({
    schemaVersion: 1,
    kind: 'current-source-editorial-rebinding-plan',
    status: overallStatus,
    oldProposalFingerprint: proposals.sourceFingerprint || null,
    newSourceIdentity: identity,
    proposalDigest,
    expectedStableRecordCount: EXPECTED_EDITORIAL_RECORD_IDS.length,
    actualProposalRecordCount: rows.length,
    counts,
    missingStableIds: missingIds,
    unexpectedStableIds: unexpectedIds,
    inputs: {
      proposalsSha256: sha256(proposalBytes), editorialSourceSha256: sha256(editorialBytes),
      approvalManifestSha256: sha256(JSON.stringify(approval)), reviewQueueSha256: sha256(JSON.stringify(records)),
      ledgerEntryCount: ledgerEntries.length
    },
    items
  });
}

export async function applyRebindingPlan({ siteRoot, planPath, confirmation }) {
  const privateDir = path.join(siteRoot, 'private-review');
  const proposalPath = path.join(privateDir, 'launch-proposals.json');
  const plan = JSON.parse(await fs.readFile(planPath, 'utf8'));
  const [reportPath, proposalBytes, approvalText, recordsText, ledgerText] = await Promise.all([
    Promise.resolve(process.env.LARI_REPORT_PATH),
    fs.readFile(proposalPath),
    fs.readFile(path.join(privateDir, 'approval-manifest.json'), 'utf8'),
    fs.readFile(path.join(siteRoot, 'data/review-queue/records.json'), 'utf8'),
    fs.readFile(path.join(privateDir, 'research-ledger.jsonl'), 'utf8')
  ]);
  if (!reportPath) throw new Error('Set LARI_REPORT_PATH to the designated source report.');
  const [reportText, proposalJson] = await Promise.all([fs.readFile(reportPath, 'utf8'), Promise.resolve(JSON.parse(proposalBytes.toString('utf8')))]);
  const editorialBytes = await fs.readFile(path.join(privateDir, proposalJson.editorialFile || 'LARI_LIVE_LAUNCH_REVIEW.md'));
  const ledgerEntries = ledgerText.split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line));
  const rebuilt = await buildRebindingPlan({
    reportText, sourceRoot: path.dirname(reportPath), proposalBytes, editorialBytes,
    approval: JSON.parse(approvalText), records: JSON.parse(recordsText), ledgerEntries
  });
  if (rebuilt.planSha256 !== plan.planSha256 || stableStringify(rebuilt) !== stableStringify(plan)) throw new Error('Rebinding plan is stale or its inputs changed; generate a new plan.');
  if (plan.status !== 'ready-to-rebind-proposals; owner reauthorization still required') throw new Error('Rebinding plan contains changed or unresolved records; no proposal change is allowed.');
  if (confirmation !== 'APPLY REBIND PLAN ' + plan.planSha256) throw new Error('Exact plan confirmation phrase did not match.');
  if (sha256(proposalBytes) !== plan.inputs.proposalsSha256) throw new Error('Launch proposals changed after planning.');

  const transitionId = 'rebind-' + plan.planSha256.slice(0, 16);
  const transitionDir = path.join(privateDir, 'lineage-transitions', transitionId);
  await fs.mkdir(path.dirname(transitionDir), { recursive: true });
  await fs.mkdir(transitionDir, { recursive: false });
  const after = { ...proposalJson, sourceFingerprint: plan.newSourceIdentity.sourceFingerprint };
  const afterBytes = Buffer.from(JSON.stringify(after, null, 2) + '\n', 'utf8');
  const beforeHash = sha256(proposalBytes);
  const afterHash = sha256(afterBytes);
  await fs.writeFile(path.join(transitionDir, 'plan.json'), JSON.stringify(plan, null, 2) + '\n', { flag: 'wx' });
  await fs.writeFile(path.join(transitionDir, 'launch-proposals.before.json'), proposalBytes, { flag: 'wx' });
  await fs.writeFile(path.join(transitionDir, 'launch-proposals.after.json'), afterBytes, { flag: 'wx' });
  const journalPath = path.join(transitionDir, 'journal.json');
  const journal = { schemaVersion: 1, transitionId, status: 'prepared', beforeSha256: beforeHash, afterSha256: afterHash, sourceReportSha256: plan.newSourceIdentity.reportSha256, sourceFingerprint: plan.newSourceIdentity.sourceFingerprint, requiresOwnerReauthorization: true, approvalsChanged: false, queueChanged: false, snapshotChanged: false };
  await fs.writeFile(journalPath, JSON.stringify(journal, null, 2) + '\n', { flag: 'wx' });
  const temp = proposalPath + '.' + transitionId + '.tmp';
  await fs.writeFile(temp, afterBytes, { flag: 'wx' });
  await fs.rename(temp, proposalPath);
  journal.status = 'committed';
  journal.committedAt = new Date().toISOString();
  await fs.writeFile(journalPath, JSON.stringify(journal, null, 2) + '\n');
  return { transitionId, journalPath, proposalSha256: afterHash, requiresOwnerReauthorization: true, approvalsChanged: false };
}

export async function recoverPreparedRebindings(siteRoot) {
  const base = path.join(siteRoot, 'private-review/lineage-transitions');
  const proposalPath = path.join(siteRoot, 'private-review/launch-proposals.json');
  const directories = await fs.readdir(base, { withFileTypes: true }).catch(error => error.code === 'ENOENT' ? [] : Promise.reject(error));
  const results = [];
  const currentHash = sha256(await fs.readFile(proposalPath));
  for (const entry of directories.filter(item => item.isDirectory())) {
    const journalPath = path.join(base, entry.name, 'journal.json');
    const journal = JSON.parse(await fs.readFile(journalPath, 'utf8'));
    if (journal.status !== 'prepared') continue;
    if (currentHash === journal.afterSha256) journal.status = 'committed-recovered';
    else if (currentHash === journal.beforeSha256) journal.status = 'aborted-no-mutation';
    else journal.status = 'manual-recovery-required';
    journal.recoveredAt = new Date().toISOString();
    await fs.writeFile(journalPath, JSON.stringify(journal, null, 2) + '\n');
    results.push({ transitionId: journal.transitionId, status: journal.status, requiresOwnerReauthorization: true });
    if (journal.status === 'manual-recovery-required') throw new Error('Rebinding recovery found an unexpected proposal identity; manual recovery required.');
  }
  return results;
}
