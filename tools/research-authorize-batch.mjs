import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { stdin as input, stdout as output } from 'node:process';
import { fileURLToPath } from 'node:url';
import { appendDecisionEvent, buildCurrentApprovalManifest, readDecisionEventLog } from './decision-history.mjs';
import { hashPublicContent, sha256, stableStringify } from './publication-crypto.mjs';
import { recomputeSourceEntry, validateApprovalSet } from './approval-validation.mjs';
import { scanPublicText } from './data-schema.mjs';

const root = path.resolve(process.env.LARI_SITE_ROOT || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'));
const privateDir = path.resolve(process.env.LARI_PRIVATE_REVIEW_DIR || path.join(root, 'private-review'));
const reportPath = process.env.LARI_REPORT_PATH ? path.resolve(process.env.LARI_REPORT_PATH) : null;
const manifestPath = process.argv[2] ? path.resolve(process.argv[2]) : null;
if (!reportPath) throw new Error('Set LARI_REPORT_PATH to the designated current source report.');
if (!manifestPath) throw new Error('Usage: node tools/research-authorize-batch.mjs <exact-reviewed-batch-manifest.json>');

const allowedFields = new Set([
  'id','revision','collection','title','summary','researchQuestion','researchArea','researchAreas','architectureComponent',
  'whyItMatters','status','verificationStatus','lifecycleStatus','sourceRecordId','measuredAt','evaluationMethod','baseline',
  'candidateMethod','comparisonConditions','result','outcome','environment','externalModelUsage','coldReloadResult',
  'causalAblationResult','transferResult','measurements','measurementConditions','limitations','relatedExperimentIds',
  'relationships','publicProvenance','reportVersion','sourceFingerprint','publishedAt','lastReviewedAt'
]);
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const atomicWrite = async (filePath, bytes) => {
  const temp = filePath + '.' + crypto.randomUUID() + '.tmp';
  await fs.writeFile(temp, bytes, { flag: 'wx' });
  await fs.rename(temp, filePath);
};
let lineBuffer = '';
let inputListenerAttached = false;
const lineResolvers = [];
const onInputData = chunk => {
  lineBuffer += chunk;
  while (lineResolvers.length && lineBuffer.includes('\n')) {
    const newline = lineBuffer.indexOf('\n');
    const line = lineBuffer.slice(0, newline).replace(/\r$/, '');
    lineBuffer = lineBuffer.slice(newline + 1);
    lineResolvers.shift()(line);
  }
  if (!lineResolvers.length) input.pause();
};
const readInteractiveLine = prompt => new Promise(resolve => {
  output.write(prompt);
  lineResolvers.push(resolve);
  if (!inputListenerAttached) {
    input.setEncoding('utf8');
    input.on('data', onInputData);
    inputListenerAttached = true;
  }
  if (lineBuffer.includes('\n')) onInputData('');
  input.resume();
});
const noAuthToken = value => {
  if (typeof value === 'string') {
    return !/\bAUTHORIZE BATCH [a-f0-9]{64}\b/i.test(value)
      && !/\bAUTHORIZE [a-z0-9-]+ REPORT [a-f0-9]{64} CONTENT [a-f0-9]{64}\b/i.test(value);
  }
  if (!value || typeof value !== 'object') return true;
  return Object.entries(value).every(([key, child]) =>
    !/^(authorizationPhrase|acceptedPhrase|ownerConfirmation|authorizationToken)$/i.test(key) && noAuthToken(child));
};

async function prepare() {
  const [manifestBytes, reportText, scan, proposalBytes, p2Bytes] = await Promise.all([
    fs.readFile(manifestPath),
    fs.readFile(reportPath, 'utf8'),
    fs.readFile(path.join(privateDir, 'research-scan.json'), 'utf8').then(JSON.parse),
    fs.readFile(path.join(privateDir, 'launch-proposals.json')),
    fs.readFile(path.join(privateDir, 'p2-rebind-plan.json'))
  ]);
  const manifestRaw = manifestBytes.toString('utf8');
  assert(Buffer.from(manifestRaw, 'utf8').equals(manifestBytes), 'Manifest is not canonical UTF-8 text.');
  const manifestHash = sha256(manifestBytes);
  const sidecarPath = manifestPath + '.sha256';
  const sidecarText = await fs.readFile(sidecarPath, 'utf8');
  assert(sidecarText.trim().split(/\s+/)[0].toLowerCase() === manifestHash, 'Manifest sidecar does not match exact manifest bytes.');
  const manifest = JSON.parse(manifestRaw);
  const { manifestSha256, ...payload } = manifest;
  assert(manifest.kind === 'lari-current-source-owner-publication-batch-review' && manifest.status === 'prepared-not-authorized', 'Manifest kind or status is not eligible for owner review.');
  assert(/^[a-f0-9]{64}$/i.test(manifestSha256 || '') && sha256(stableStringify(payload)) === manifestSha256, 'Manifest canonical payload hash is invalid.');
  assert(noAuthToken(manifest), 'Batch file contains an embedded authorization phrase or token.');
  const reportSha256 = sha256(reportText);
  const sourceFingerprint = reportText.match(/Source fingerprint:\s*(?:\x60)?([a-f0-9]{64})/i)?.[1] || null;
  assert(manifest.source.reportSha256 === reportSha256 && manifest.source.sourceFingerprint === sourceFingerprint, 'Batch source report identity is stale.');

  const p2Raw = p2Bytes.toString('utf8');
  const p2 = JSON.parse(p2Raw);
  const { planSha256, ...planPayload } = p2;
  assert(sha256(stableStringify(planPayload)) === planSha256 && manifest.source.p2RebindPlanSha256 === planSha256, 'P2 rebind plan is stale or does not match the reviewed manifest.');
  assert(p2.newSourceIdentity?.reportSha256 === reportSha256 && p2.newSourceIdentity?.sourceFingerprint === sourceFingerprint, 'P2 plan is bound to another source.');
  assert(stableStringify(manifest.source.p2Classification) === stableStringify({
    unchangedEvidence: p2.counts.unchangedEvidence,
    changedEvidence: p2.counts.changedEvidence,
    unresolvedLineage: p2.counts.unresolvedLineage
  }), 'P2 classification summary differs.');
  assert(scan.source?.reportSha256 === reportSha256 && scan.source?.sourceFingerprint === sourceFingerprint, 'Private scan is stale against the source report.');

  const proposalManifest = JSON.parse(proposalBytes.toString('utf8'));
  const editorialPath = path.join(privateDir, proposalManifest.editorialFile || 'LARI_LIVE_LAUNCH_REVIEW.md');
  const editorialBytes = await fs.readFile(editorialPath);
  const passRows = manifest.records.filter(row => row.classification === 'PASS');
  const excludedRows = manifest.records.filter(row => row.classification !== 'PASS');
  assert(manifest.records.length === manifest.scope.reviewedRecordCount && passRows.length === manifest.scope.includedPassCount && excludedRows.length === manifest.scope.excludedCount, 'Manifest counts do not reconcile.');
  assert(stableStringify(passRows.map(row => row.recordId)) === stableStringify(manifest.scope.includedRecordIds), 'Included IDs differ from exact PASS rows.');
  assert(stableStringify(excludedRows.map(row => row.recordId)) === stableStringify(manifest.scope.excludedRecordIds), 'Excluded IDs differ from non-PASS rows.');
  assert(passRows.length === 14 && excludedRows.length === 1 && excludedRows.every(row => row.classification === 'HOLD'), 'Expected exactly 14 PASS records and one explicitly held record.');
  assert(new Set(manifest.records.map(row => row.recordId)).size === manifest.records.length, 'Manifest has duplicate record IDs.');
  assert(manifest.scope.noMetricsOrPaperCandidatesIncluded === true, 'Manifest scope does not exclude metrics and paper candidates.');

  const includedIds = new Set(passRows.map(row => row.recordId));
  const reportRoot = path.dirname(reportPath);
  for (const row of passRows) {
    assert(row.record?.id === row.recordId && row.record.collection === row.collection, 'Stable ID/type mismatch for ' + row.recordId);
    assert(Object.keys(row.record).every(key => allowedFields.has(key)), 'Non-allowlisted public field in ' + row.recordId);
    assert(hashPublicContent({ ...row.record, publishedAt: null }) === row.currentPublicContentSha256, 'Public content hash mismatch for ' + row.recordId);
    assert(scanPublicText(row.record).length === 0, 'Privacy scan failed for ' + row.recordId);
    const matches = scan.entries.filter(entry => entry.scanId === row.scanId);
    assert(matches.length === 1, 'Missing or ambiguous source scan entry for ' + row.recordId);
    const entry = matches[0];
    assert(entry.reviewDraft?.id === row.recordId && entry.reviewDraft?.collection === row.collection, 'Current scan binds a different record identity for ' + row.recordId);
    const sourceCheck = await recomputeSourceEntry({ entry, reportText, sourceRoot: reportRoot, proposalManifest, proposalBytes, editorialBytes });
    assert(sourceCheck.errors.length === 0, 'Source/evidence verification failed for ' + row.recordId + ': ' + sourceCheck.errors.join('; '));
    assert(sourceCheck.sectionSha256 === row.currentSourceSectionSha256 && sourceCheck.sectionSha256 === row.p2NewSourceSectionSha256, 'Source section hash mismatch for ' + row.recordId);
    assert(sourceCheck.evidenceDigest === row.evidenceDigest, 'Evidence digest mismatch for ' + row.recordId);
    assert(stableStringify(sourceCheck.references) === stableStringify(row.evidenceReferences), 'Evidence references differ for ' + row.recordId);
    const planItem = p2.items.find(item => item.recordId === row.recordId);
    assert(planItem && planItem.newSectionSha256 === row.currentSourceSectionSha256, 'Record is absent or changed in P2 plan: ' + row.recordId);
    if (!row.matchesHistoricalApprovedContent) {
      assert(row.revision?.requiresFreshOwnerAuthorization === true && row.revision.newPublicContentSha256 === row.currentPublicContentSha256, 'Changed historical content lacks explicit revision provenance: ' + row.recordId);
    }
    const refs = [
      ...(row.record.relatedExperimentIds || []),
      ...(row.record.relationships || []).map(item => item.recordId)
    ];
    for (const ref of refs) assert(includedIds.has(ref), 'Dangling or excluded public relationship in ' + row.recordId + ': ' + ref);
  }

  const historyPath = path.join(privateDir, 'decision-events.jsonl');
  const history = await readDecisionEventLog(historyPath);
  assert(history.errors.length === 0, 'Existing decision history is invalid: ' + history.errors.join('; '));
  assert(history.events.length === manifest.decisionHistory.eventCount
    && history.events.at(-1)?.eventId === manifest.decisionHistory.lastEventId
    && history.events.at(-1)?.eventHashSha256 === manifest.decisionHistory.headHashSha256,
  'Decision history changed since this batch was reviewed.');
  const already = history.events.find(event =>
    event.eventType === 'owner-batch-authorization' && event.authorization?.manifestFileSha256 === manifestHash);
  assert(!already, 'This exact manifest already has a batch event; inspect recovery state instead of authorizing twice.');
  for (const row of excludedRows) {
    const leaked = history.events.some(event =>
      event.recordId === row.recordId
      && event.explicitCurrentSourceAuthorization === true
      && ['approved','approved-edited'].includes(event.decision)
      && event.sourceReportSha256 === reportSha256
      && event.sourceFingerprint === sourceFingerprint);
    assert(!leaked, 'An excluded record already has a current-source authorization event: ' + row.recordId);
  }
  return {
    manifest, manifestRaw, manifestHash, expectedPhrase: 'AUTHORIZE BATCH ' + manifestHash,
    reportText, reportSha256, sourceFingerprint, scan, proposalManifest, proposalBytes, editorialBytes,
    historyPath, history, passRows, excludedRows
  };
}

const state = await prepare();
console.log('Prepared exact owner batch. No changes have been written.');
console.log('Manifest SHA-256: ' + state.manifestHash);
console.log('Source report SHA-256: ' + state.reportSha256);
console.log('Included (' + state.passRows.length + '): ' + state.passRows.map(row => row.recordId).join(', '));
console.log('Excluded (' + state.excludedRows.length + '): ' + state.excludedRows.map(row => row.recordId + ' [' + row.classification + ']').join(', '));
for (const row of state.passRows.filter(row => row.revision)) {
  console.log('Revised fields: ' + row.recordId + ' => ' + row.revision.changedPublicFields.join(', ') + '; requires fresh authorization.');
}
if (!input.isTTY || !output.isTTY) throw new Error('Owner batch authorization requires a real interactive terminal; piped, batch-file, and non-TTY input are refused.');

try {
  const reviewer = (await readInteractiveLine('Owner reviewer name/handle: ')).trim();
  assert(reviewer.length > 0 && reviewer.length <= 100, 'A reviewer name/handle is required.');
  const accepted = await readInteractiveLine('Type this exact phrase to authorize the listed batch: ' + state.expectedPhrase + '\n');
  if (accepted !== state.expectedPhrase) throw new Error('Authorization phrase mismatch; no writes were made.');
  const rechecked = await prepare();
  assert(rechecked.manifestHash === state.manifestHash && rechecked.expectedPhrase === accepted, 'Manifest or evidence changed during confirmation; stopped without applying.');

  const batchRows = rechecked.passRows;
  const sectionDigest = sha256(stableStringify(batchRows.map(row => ({
    recordId: row.recordId, sectionSha256: row.currentSourceSectionSha256, evidenceDigest: row.evidenceDigest
  }))));
  const evidenceSetDigest = sha256(stableStringify(batchRows.map(row => ({
    recordId: row.recordId, evidenceReferences: row.evidenceReferences
  }))));
  const batchEventData = {
    recordId: 'owner-batch-' + rechecked.manifestHash.slice(0, 16),
    scanId: 'owner-batch-' + rechecked.manifestHash.slice(0, 16),
    eventType: 'owner-batch-authorization',
    sourceReportSha256: rechecked.reportSha256,
    sourceFingerprint: rechecked.sourceFingerprint,
    sectionSha256: sectionDigest,
    evidenceDigest: evidenceSetDigest,
    evidenceReferences: [],
    approvedContentSha256: rechecked.manifestHash,
    collection: 'batch',
    decision: 'batch-authorized',
    decisionTimestamp: new Date().toISOString(),
    reviewer,
    explicitCurrentSourceAuthorization: true,
    authorization: {
      method: 'owner-authorized-batch-manifest',
      channel: 'interactive-console',
      phraseMatched: true,
      manifestRaw: rechecked.manifestRaw,
      manifestFileSha256: rechecked.manifestHash,
      expectedPhrase: rechecked.expectedPhrase,
      acceptedPhrase: accepted
    },
    note: 'Owner confirmed one exact, source/evidence/content-bound batch through the interactive terminal.'
  };
  let events = await appendDecisionEvent({ filePath: rechecked.historyPath, eventData: batchEventData });
  const batchEvent = events.at(-1);
  for (const row of batchRows) {
    const eventData = {
      recordId: row.recordId,
      scanId: row.scanId,
      sourceReportSha256: rechecked.reportSha256,
      sourceFingerprint: rechecked.sourceFingerprint,
      sectionSha256: row.currentSourceSectionSha256,
      evidenceDigest: row.evidenceDigest,
      evidenceReferences: row.evidenceReferences,
      approvedContentSha256: row.currentPublicContentSha256,
      collection: row.collection,
      decision: 'approved',
      decisionTimestamp: new Date().toISOString(),
      reviewer,
      explicitCurrentSourceAuthorization: true,
      authorization: {
        method: 'owner-authorized-batch-record',
        channel: 'interactive-console',
        phraseMatched: true,
        batchAuthorizationEventId: batchEvent.eventId,
        batchManifestFileSha256: rechecked.manifestHash,
        expectedPhrase: rechecked.expectedPhrase,
        acceptedPhrase: accepted
      },
      note: 'Authorized as a member of the exact owner-confirmed batch manifest.'
    };
    events = await appendDecisionEvent({ filePath: rechecked.historyPath, eventData });
  }

  const queue = batchRows.map(row => row.record);
  const approval = buildCurrentApprovalManifest({
    events, records: queue, reportSha256: rechecked.reportSha256,
    sourceFingerprint: rechecked.sourceFingerprint, historyRelativePath: 'decision-events.jsonl'
  });
  assert(approval.status === 'approved'
    && stableStringify([...approval.recordIds].sort()) === stableStringify([...rechecked.manifest.scope.includedRecordIds].sort()),
  'Derived approvals do not equal exact batch IDs.');
  assert(!approval.recordIds.some(id => rechecked.excludedRows.some(row => row.recordId === id)),
    'An excluded record entered the derived approval set.');
  const errors = await validateApprovalSet({
    records: queue, approval, scan: rechecked.scan, reportText: rechecked.reportText,
    sourceRoot: path.dirname(reportPath), decisionEvents: events,
    proposalManifest: rechecked.proposalManifest, proposalBytes: rechecked.proposalBytes,
    editorialBytes: rechecked.editorialBytes
  });
  assert(errors.length === 0, 'Post-authorization validation failed: ' + errors.join('; '));

  await atomicWrite(path.join(root, 'data/review-queue/records.json'), JSON.stringify(queue, null, 2) + '\n');
  await atomicWrite(path.join(privateDir, 'approval-manifest.json'), JSON.stringify(approval, null, 2) + '\n');
  console.log('Batch authorization appended and validated. Staging queue now contains exactly ' + queue.length + ' PASS records; HOLD/REVISE records remain excluded. No export was run.');
  console.log('No-write approval ID set: ' + approval.recordIds.join(', '));
} finally {
  input.pause();
  if (inputListenerAttached) input.removeListener('data', onInputData);
  if (typeof input.unref === 'function') input.unref();
}
