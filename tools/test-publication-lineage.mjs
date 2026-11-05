import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { buildRebindingPlan, applyRebindingPlan, recoverPreparedRebindings, extractReportSections, resolveEvidenceReferences, referenceTuples } from './publication-lineage.mjs';
import { authorizationPhrase, readDecisionEventLog, validateDecisionEventLog } from './decision-history.mjs';
import { hashPublicContent, sha256 } from './publication-crypto.mjs';
import { validateApprovalSet, recomputeSourceEntry } from './approval-validation.mjs';
import { scanPublicText } from './data-schema.mjs';

const siteRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const preservedRoot = 'D:/Lari-workspace/LARI_PUBLICATION_SYSTEM_REPAIR_P2/preservation/prechange-20261105';
const reportPath = 'D:/Lari-workspace/html-agent-swarm/LARI_FULL_REPORT.md';
const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'lari-p2-publication-'));
const fixtureRoot = path.join(tempRoot, 'site');
const privateDir = path.join(fixtureRoot, 'private-review');
const testResults = [];
const run = (script, env, inputText = undefined) => spawnSync(process.execPath, [path.join(siteRoot, 'tools', script)], { cwd: siteRoot, env: { ...process.env, ...env }, input: inputText, encoding: 'utf8' });
const json = async file => JSON.parse(await fs.readFile(file, 'utf8'));
const digestFile = async file => sha256(await fs.readFile(file));
const digestTree = async dir => {
  const rows = [];
  const walk = async current => {
    for (const item of await fs.readdir(current, { withFileTypes: true })) {
      const target = path.join(current, item.name);
      if (item.isDirectory()) await walk(target);
      else rows.push([path.relative(dir, target).replaceAll('\\', '/'), await digestFile(target)]);
    }
  };
  await walk(dir);
  return sha256(JSON.stringify(rows.sort((a, b) => a[0].localeCompare(b[0]))));
};
const makeWritable = async dir => {
  for (const item of await fs.readdir(dir, { withFileTypes: true })) {
    const target = path.join(dir, item.name);
    if (item.isDirectory()) { await fs.chmod(target, 0o777).catch(() => {}); await makeWritable(target); }
    else await fs.chmod(target, 0o666).catch(() => {});
  }
};
const runReview = async (actions, scanIds) => {
  const inputText = actions.flatMap(action => [action.action, ...(action.action === 'approve' ? [action.authorizationPhrase] : action.action === 'edit' ? [JSON.stringify(action.record), action.authorizationPhrase] : [])]).join('\n') + '\n';
  return run('research-review.mjs', { LARI_SITE_ROOT: fixtureRoot, LARI_PRIVATE_REVIEW_DIR: privateDir, LARI_REPORT_PATH: reportPath, LARI_SCAN_OUTPUT_PATH: path.join(privateDir, 'research-scan.json'), LARI_REVIEW_SCAN_IDS: scanIds.join(','), LARI_REVIEWER: 'Disposable P2 qualification owner' }, inputText);
};

try {
  await fs.mkdir(fixtureRoot, { recursive: true });
  await fs.cp(path.join(preservedRoot, 'data'), path.join(fixtureRoot, 'data'), { recursive: true });
  await fs.cp(path.join(preservedRoot, 'private-review'), privateDir, { recursive: true });
  await makeWritable(fixtureRoot);
  const reportText = await fs.readFile(reportPath, 'utf8');
  const [proposalBytes, approval, queue, ledgerText] = await Promise.all([
    fs.readFile(path.join(privateDir, 'launch-proposals.json')),
    json(path.join(privateDir, 'approval-manifest.json')),
    json(path.join(fixtureRoot, 'data/review-queue/records.json')),
    fs.readFile(path.join(privateDir, 'research-ledger.jsonl'), 'utf8')
  ]);
  const proposalManifest = JSON.parse(proposalBytes.toString('utf8'));
  const editorialBytes = await fs.readFile(path.join(privateDir, proposalManifest.editorialFile));
  const ledgerEntries = ledgerText.split(/\r?\n/).filter(Boolean).map(JSON.parse);
  const oldApprovalBytesHash = await digestFile(path.join(privateDir, 'approval-manifest.json'));
  const oldDecisionBytesHash = await digestFile(path.join(privateDir, 'research-decisions.json'));
  const oldQueueHash = await digestFile(path.join(fixtureRoot, 'data/review-queue/records.json'));
  const oldSnapshotHash = await digestFile(path.join(fixtureRoot, 'data/approved/snapshot.json'));

  const staleScanRoot = path.join(tempRoot, 'stale-site');
  await fs.mkdir(staleScanRoot, { recursive: true });
  await fs.cp(path.join(preservedRoot, 'data'), path.join(staleScanRoot, 'data'), { recursive: true });
  await fs.cp(path.join(preservedRoot, 'private-review'), path.join(staleScanRoot, 'private-review'), { recursive: true });
  await makeWritable(staleScanRoot);
  const staleDraftHash = await digestTree(path.join(staleScanRoot, 'private-review/paper-candidates'));
  const staleScan = run('research-index.mjs', { LARI_SITE_ROOT: staleScanRoot, LARI_PRIVATE_REVIEW_DIR: path.join(staleScanRoot, 'private-review'), LARI_REPORT_PATH: reportPath, LARI_SCAN_OUTPUT_PATH: path.join(staleScanRoot, 'private-review/research-scan.json') });
  assert.equal(staleScan.status, 0, staleScan.stderr);
  assert.equal(await digestTree(path.join(staleScanRoot, 'private-review/paper-candidates')), staleDraftHash);
  const staleIndex = await json(path.join(staleScanRoot, 'private-review/research-scan.json'));
  assert.equal(staleIndex.editorialRelease.status, 'source-fingerprint-mismatch');
  assert.equal(staleIndex.entries.filter(entry => entry.scanId.startsWith('editorial-')).length, 0);
  testResults.push('A stale proposal fingerprint is surfaced explicitly and yields no editorial projections before the explicit rebind step.');

  const plan = await buildRebindingPlan({ reportText, sourceRoot: path.dirname(reportPath), proposalBytes, editorialBytes, approval, records: queue, ledgerEntries });
  assert.equal(plan.status, 'ready-to-rebind-proposals; owner reauthorization still required');
  assert.deepEqual(plan.counts, { unchangedEvidence: 15, changedEvidence: 0, unresolvedLineage: 0 });
  assert.equal(new Set(plan.items.map(item => item.recordId)).size, 15);
  assert.ok(plan.items.every(item => item.classification === 'unchanged-evidence'));
  assert.notEqual(plan.items[0].oldSourceReportSha256, plan.newSourceIdentity.reportSha256);
  const planPath = path.join(privateDir, 'test-rebinding-plan.json');
  await fs.writeFile(planPath, JSON.stringify(plan, null, 2) + '\n', { flag: 'wx' });
  process.env.LARI_REPORT_PATH = reportPath;
  const proposalBeforeBadConfirmation = await digestFile(path.join(privateDir, 'launch-proposals.json'));
  await assert.rejects(applyRebindingPlan({ siteRoot: fixtureRoot, planPath, confirmation: 'APPLY REBIND PLAN wrong' }), /Exact plan confirmation phrase did not match/);
  assert.equal(await digestFile(path.join(privateDir, 'launch-proposals.json')), proposalBeforeBadConfirmation);
  const apply = await applyRebindingPlan({ siteRoot: fixtureRoot, planPath, confirmation: `APPLY REBIND PLAN ${plan.planSha256}` });
  assert.equal(apply.requiresOwnerReauthorization, true);
  assert.equal(await digestFile(path.join(fixtureRoot, 'data/review-queue/records.json')), oldQueueHash);
  assert.equal(await digestFile(path.join(fixtureRoot, 'data/approved/snapshot.json')), oldSnapshotHash);
  assert.equal(await digestFile(path.join(privateDir, 'approval-manifest.json')), oldApprovalBytesHash);
  const currentProposal = await json(path.join(privateDir, 'launch-proposals.json'));
  assert.equal(currentProposal.sourceFingerprint, plan.newSourceIdentity.sourceFingerprint);
  assert.equal((await json(path.join(apply.journalPath))).requiresOwnerReauthorization, true);
  testResults.push('15/15 exact stable IDs rebind as unchanged evidence; the transition changes proposal identity only and preserves queue, approvals, and snapshot.');

  const draftHashBeforeIndex = await digestTree(path.join(privateDir, 'paper-candidates'));
  const scanRun = run('research-index.mjs', { LARI_SITE_ROOT: fixtureRoot, LARI_PRIVATE_REVIEW_DIR: privateDir, LARI_REPORT_PATH: reportPath, LARI_SCAN_OUTPUT_PATH: path.join(privateDir, 'research-scan.json') });
  assert.equal(scanRun.status, 0, `disposable scan failed: ${scanRun.stderr}`);
  assert.equal(await digestTree(path.join(privateDir, 'paper-candidates')), draftHashBeforeIndex);
  const scan = await json(path.join(privateDir, 'research-scan.json'));
  assert.equal(scan.source.reportSha256, plan.newSourceIdentity.reportSha256);
  const editorial = scan.entries.filter(entry => entry.scanId.startsWith('editorial-'));
  assert.equal(editorial.length, 15);
  assert.deepEqual(new Set(editorial.map(entry => entry.reviewDraft.id)), new Set(plan.items.map(item => item.recordId)));
  assert.ok(editorial.every(entry => !entry.approvalBlockedReason && entry.sourceSectionTitle));
  const paperIds = editorial.map(entry => entry.reviewDraft.id).filter(id => /2e[.-]/i.test(id));
  assert.deepEqual(paperIds, [], 'private draft papers do not enter the 15-record editorial projection set');
  const paperManifest = await json(path.join(privateDir, 'paper-candidates/manifest.json'));
  const paperDrafts = paperManifest.candidates || [];
  assert.ok(paperDrafts.length >= 3);
  assert.ok(paperDrafts.every(draft => !plan.items.some(item => item.scanId === draft.scanId)));
  const originalSnapshot = await json(path.join(fixtureRoot, 'data/approved/snapshot.json'));
  const publicIdsBefore = ['experiments','capabilities','milestones','metrics'].flatMap(key => originalSnapshot[key].map(record => record.id));
  assert.equal(publicIdsBefore.length, 15);
  assert.deepEqual(new Set(publicIdsBefore), new Set(plan.items.map(item => item.recordId)));
  testResults.push('Safe scanner/index path emits exactly the fifteen current editorial projections and does not import private paper drafts.');

  const one = editorial[0];
  const firstQueueRecord = queue.find(item => item.id === one.reviewDraft.id);
  const forgedBatchPath = path.join(privateDir, 'review-batch-forbidden.json');
  await fs.writeFile(forgedBatchPath, JSON.stringify([{ scanId: one.scanId, action: 'approve', reviewer: 'Disposable P2 qualification owner', authorizationPhrase: authorizationPhrase({ recordId: firstQueueRecord.id, sourceReportSha256: scan.source.reportSha256, approvedContentSha256: hashPublicContent(firstQueueRecord) }) }], null, 2) + '\n');
  const batchAttempt = run('research-review.mjs', { LARI_SITE_ROOT: fixtureRoot, LARI_PRIVATE_REVIEW_DIR: privateDir, LARI_REPORT_PATH: reportPath, LARI_SCAN_OUTPUT_PATH: path.join(privateDir, 'research-scan.json'), LARI_REVIEW_INPUT_PATH: forgedBatchPath, LARI_REVIEW_SCAN_IDS: one.scanId, LARI_REVIEWER: 'Disposable P2 qualification owner' });
  assert.notEqual(batchAttempt.status, 0);
  assert.match(batchAttempt.stderr, /Decision event rejected before append/);
  assert.equal(await digestFile(path.join(privateDir, 'approval-manifest.json')), oldApprovalBytesHash);
  assert.equal((await readDecisionEventLog(path.join(privateDir, 'decision-events.jsonl'))).events.length, 0);
  await fs.rm(forgedBatchPath, { force: true });
  testResults.push('A generated/batch review file cannot substitute for an owner action; the approval event is rejected before history append.');
  const wrong = await runReview([{ scanId: one.scanId, action: 'approve', authorizationPhrase: 'AUTHORIZE wrong' }], [one.scanId]);
  assert.equal(wrong.status, 0, wrong.stderr);
  assert.equal((await json(path.join(privateDir, 'approval-manifest.json'))).status, 'pending-current-source-authorization');
  const firstHistory = await readDecisionEventLog(path.join(privateDir, 'decision-events.jsonl'));
  assert.equal(firstHistory.errors.length, 0);
  assert.ok(firstHistory.events.some(event => event.scanId === one.scanId && event.decision === 'deferred'));
  assert.equal(await digestFile(path.join(privateDir, 'approval-manifest.legacy-v2.json')), oldApprovalBytesHash);
  assert.equal(await digestFile(path.join(privateDir, 'research-decisions.legacy-v1.json')), oldDecisionBytesHash);
  testResults.push('Wrong/missing current-source authorization fails closed, preserves old receipts byte-for-byte, and appends a deferred event.');

  const queueNow = await json(path.join(fixtureRoot, 'data/review-queue/records.json'));
  const approveActions = editorial.map(entry => {
    const record = queueNow.find(item => item.id === entry.reviewDraft.id);
    const contentSha = hashPublicContent(record);
    return { scanId: entry.scanId, action: 'approve', authorizationPhrase: authorizationPhrase({ recordId: record.id, sourceReportSha256: scan.source.reportSha256, approvedContentSha256: contentSha }) };
  });
  const approveRun = await runReview(approveActions, editorial.map(entry => entry.scanId));
  assert.equal(approveRun.status, 0, `authorized review failed: ${approveRun.stderr}`);
  const currentApproval = await json(path.join(privateDir, 'approval-manifest.json'));
  assert.equal(currentApproval.schemaVersion, 3);
  assert.equal(currentApproval.status, 'approved');
  assert.equal(currentApproval.records.length, 15);
  assert.deepEqual(new Set(currentApproval.recordIds), new Set(plan.items.map(item => item.recordId)));
  const historyAfter = await readDecisionEventLog(path.join(privateDir, 'decision-events.jsonl'));
  assert.equal(historyAfter.errors.length, 0, historyAfter.errors.join('; '));
  assert.equal(historyAfter.events.length, firstHistory.events.length + 15);
  assert.ok(historyAfter.events.some(event => event.eventId === firstHistory.events.find(item => item.scanId === one.scanId && item.decision === 'deferred')?.eventId));
  assert.equal(historyAfter.events.filter(event => event.scanId === one.scanId).length, firstHistory.events.filter(event => event.scanId === one.scanId).length + 1);
  assert.equal(historyAfter.events.filter(event => event.explicitCurrentSourceAuthorization === true).length, 15);
  const validation = run('validate-approved-data.mjs', { LARI_SITE_ROOT: fixtureRoot, LARI_PRIVATE_REVIEW_DIR: privateDir, LARI_REPORT_PATH: reportPath, LARI_SCAN_OUTPUT_PATH: path.join(privateDir, 'research-scan.json') });
  assert.equal(validation.status, 0, `authorized fixture validation failed: ${validation.stdout}\n${validation.stderr}`);
  testResults.push('Current authorization appends fifteen exact report/content-bound events; independent validation passes all fifteen records and all legacy history remains in the chain.');

  const oneRecord = queueNow.find(row => row.id === one.reviewDraft.id);
  const oneEntry = editorial.find(entry => entry.scanId === one.scanId);
  const currentProposalBytes = await fs.readFile(path.join(privateDir, 'launch-proposals.json'));
  const currentEditorialBytes = await fs.readFile(path.join(privateDir, currentProposal.editorialFile));
  const validIssues = await validateApprovalSet({ records: queueNow, approval: currentApproval, scan, reportText, sourceRoot: path.dirname(reportPath), decisionEvents: historyAfter.events, proposalManifest: currentProposal, proposalBytes: currentProposalBytes, editorialBytes: currentEditorialBytes });
  assert.deepEqual(validIssues, []);
  assert.equal(oneRecord.id, oneEntry.reviewDraft.id);

  const legacy = { ...currentApproval, schemaVersion: 2 };
  assert.ok((await validateApprovalSet({ records: queueNow, approval: legacy, scan, reportText, sourceRoot: path.dirname(reportPath), decisionEvents: historyAfter.events })).some(issue => issue.includes('legacy approval receipts are historical only')));
  assert.ok((await validateApprovalSet({ records: queueNow, approval, scan, reportText, sourceRoot: path.dirname(reportPath), decisionEvents: historyAfter.events, proposalManifest: currentProposal, proposalBytes: currentProposalBytes, editorialBytes: currentEditorialBytes })).some(issue => issue.includes('legacy approval receipts are historical only')));
  const staleReport = await validateApprovalSet({ records: queueNow, approval: currentApproval, scan, reportText: reportText + '\n', sourceRoot: path.dirname(reportPath), decisionEvents: historyAfter.events, proposalManifest: currentProposal, proposalBytes: currentProposalBytes, editorialBytes: currentEditorialBytes });
  assert.ok(staleReport.some(issue => issue.includes('global approval report SHA-256')));
  assert.ok((await validateApprovalSet({ records: queueNow, approval: currentApproval, scan: { ...scan, entries: scan.entries.filter(entry => entry.scanId !== one.scanId) }, reportText, sourceRoot: path.dirname(reportPath), decisionEvents: historyAfter.events, proposalManifest: currentProposal, proposalBytes: currentProposalBytes, editorialBytes: currentEditorialBytes })).some(issue => issue.includes('scan entry is missing or ambiguous')));
  const changedPublicRecords = queueNow.map(record => record.id === oneRecord.id ? { ...record, summary: record.summary + ' Changed without a fresh decision.' } : record);
  assert.ok((await validateApprovalSet({ records: changedPublicRecords, approval: currentApproval, scan, reportText, sourceRoot: path.dirname(reportPath), decisionEvents: historyAfter.events, proposalManifest: currentProposal, proposalBytes: currentProposalBytes, editorialBytes: currentEditorialBytes })).some(issue => issue.includes('public content changed')));
  const staleFingerprintApproval = { ...currentApproval, records: currentApproval.records.map((receipt, index) => index ? receipt : { ...receipt, sourceFingerprint: '0'.repeat(64) }) };
  assert.ok((await validateApprovalSet({ records: queueNow, approval: staleFingerprintApproval, scan, reportText, sourceRoot: path.dirname(reportPath), decisionEvents: historyAfter.events, proposalManifest: currentProposal, proposalBytes: currentProposalBytes, editorialBytes: currentEditorialBytes })).some(issue => issue.includes('receipt source fingerprint is stale')));
  const changedTypeRecords = queueNow.map(record => record.id === oneRecord.id ? { ...record, collection: 'capabilities' } : record);
  assert.ok((await validateApprovalSet({ records: changedTypeRecords, approval: currentApproval, scan, reportText, sourceRoot: path.dirname(reportPath), decisionEvents: historyAfter.events, proposalManifest: currentProposal, proposalBytes: currentProposalBytes, editorialBytes: currentEditorialBytes })).some(issue => issue.includes('stable public type is missing or changed')));
  const brokenChain = historyAfter.events.map(event => ({ ...event }));
  brokenChain[0].reviewer = 'tampered legacy event';
  assert.ok(validateDecisionEventLog(brokenChain).some(issue => issue.includes('hash does not match')));

  const evidenceRoot = path.join(tempRoot, 'source');
  await fs.mkdir(evidenceRoot, { recursive: true });
  await fs.writeFile(path.join(evidenceRoot, 'receipt.json'), '{"verified":true}\n');
  const syntheticReport = '# Synthetic\nSource fingerprint: `' + 'a'.repeat(64) + '`\n\n## Example research result\nThis fixture has enough substance to be indexed safely. [Receipt](receipt.json)\n';
  const body = syntheticReport.slice(syntheticReport.indexOf('## Example research result') + '## Example research result'.length).trim();
  const refs = await resolveEvidenceReferences(['receipt.json'], evidenceRoot);
  const syntheticEntry = { scanId: 'scan-example', sourceSectionTitle: 'Example research result', sectionSha256: sha256(body), evidenceDigest: sha256(JSON.stringify(referenceTuples(refs))), references: refs };
  assert.deepEqual((await recomputeSourceEntry({ entry: syntheticEntry, reportText: syntheticReport, sourceRoot: evidenceRoot })).errors, []);
  await fs.writeFile(path.join(evidenceRoot, 'receipt.json'), '{"verified":false}\n');
  assert.ok((await recomputeSourceEntry({ entry: syntheticEntry, reportText: syntheticReport, sourceRoot: evidenceRoot })).errors.some(issue => issue.includes('evidence references differ')));
  await fs.writeFile(path.join(evidenceRoot, 'receipt.json'), '{"verified":true}\n');
  assert.ok((await recomputeSourceEntry({ entry: syntheticEntry, reportText: syntheticReport.replace('enough substance','changed source'), sourceRoot: evidenceRoot })).errors.some(issue => issue.includes('section hash differs')));
  const ambiguousReport = syntheticReport + '\n## Example research result\nA duplicate heading.\n';
  assert.ok((await recomputeSourceEntry({ entry: syntheticEntry, reportText: ambiguousReport, sourceRoot: evidenceRoot })).errors.some(issue => issue.includes('missing or ambiguous')));
  const missingReport = syntheticReport.replace('receipt.json', 'missing-receipt.json');
  const missingBody = missingReport.slice(missingReport.indexOf('## Example research result') + '## Example research result'.length).trim();
  const missingRef = await resolveEvidenceReferences(['missing-receipt.json'], evidenceRoot);
  const missingEntry = { ...syntheticEntry, sectionSha256: sha256(missingBody), references: missingRef, evidenceDigest: sha256(JSON.stringify(referenceTuples(missingRef))) };
  assert.ok((await recomputeSourceEntry({ entry: missingEntry, reportText: missingReport, sourceRoot: evidenceRoot })).errors.some(issue => issue.includes('unresolved')));
  await fs.mkdir(path.join(evidenceRoot, 'workspace'));
  const directoryReport = syntheticReport.replace('receipt.json', 'workspace/');
  const directoryBody = directoryReport.slice(directoryReport.indexOf('## Example research result') + '## Example research result'.length).trim();
  const directoryRefs = await resolveEvidenceReferences(['workspace/'], evidenceRoot);
  const directoryEntry = { ...syntheticEntry, sectionSha256: sha256(directoryBody), references: directoryRefs, evidenceDigest: sha256(JSON.stringify(referenceTuples(directoryRefs))) };
  assert.ok((await recomputeSourceEntry({ entry: directoryEntry, reportText: directoryReport, sourceRoot: evidenceRoot })).errors.some(issue => issue.includes('exact file hash')));
  testResults.push('Synthetic source controls reject altered section bytes, altered evidence-file hashes, duplicate headings, stale report identity, and missing scan entries.');

  const changedContentRoot = path.join(tempRoot, 'changed-content-site');
  await fs.cp(fixtureRoot, changedContentRoot, { recursive: true });
  await makeWritable(changedContentRoot);
  const changedContentPrivate = path.join(changedContentRoot, 'private-review');
  const changedQueuePath = path.join(changedContentRoot, 'data/review-queue/records.json');
  const changedQueue = await json(changedQueuePath);
  const changedRecord = { ...changedQueue.find(record => record.id === oneRecord.id), summary: oneRecord.summary + ' Owner reviewed revised wording.' };
  changedQueue.splice(changedQueue.findIndex(record => record.id === oneRecord.id), 1, changedRecord);
  await fs.writeFile(changedQueuePath, JSON.stringify(changedQueue, null, 2) + '\n');
  const changedApproval = await json(path.join(changedContentPrivate, 'approval-manifest.json'));
  const changedEvents = await readDecisionEventLog(path.join(changedContentPrivate, 'decision-events.jsonl'));
  assert.ok((await validateApprovalSet({ records: changedQueue, approval: changedApproval, scan, reportText, sourceRoot: path.dirname(reportPath), decisionEvents: changedEvents.events, proposalManifest: currentProposal, proposalBytes: currentProposalBytes, editorialBytes: currentEditorialBytes })).some(issue => issue.includes('public content changed')));
  const changedContentHash = hashPublicContent(changedRecord);
  const reauthorizationInput = ['edit', JSON.stringify(changedRecord), authorizationPhrase({ recordId: changedRecord.id, sourceReportSha256: scan.source.reportSha256, approvedContentSha256: changedContentHash })].join('\n') + '\n';
  const reauthorization = run('research-review.mjs', { LARI_SITE_ROOT: changedContentRoot, LARI_PRIVATE_REVIEW_DIR: changedContentPrivate, LARI_REPORT_PATH: reportPath, LARI_SCAN_OUTPUT_PATH: path.join(changedContentPrivate, 'research-scan.json'), LARI_REVIEW_SCAN_IDS: one.scanId, LARI_REVIEWER: 'Disposable P2 qualification owner' }, reauthorizationInput);
  assert.equal(reauthorization.status, 0, reauthorization.stderr);
  const newEvents = await readDecisionEventLog(path.join(changedContentPrivate, 'decision-events.jsonl'));
  const newestForRecord = newEvents.events.filter(event => event.recordId === changedRecord.id).at(-1);
  assert.equal(newestForRecord.previousRecordEventId, newEvents.events.filter(event => event.recordId === changedRecord.id).at(-2).eventId);
  assert.equal(newestForRecord.approvedContentSha256, changedContentHash);
  testResults.push('Same-ID public-content change fails before review and succeeds only after a new exact-content authorization event linked to the prior record event.');

  const unauthorizedRoot = path.join(tempRoot, 'unauthorized-site');
  await fs.cp(fixtureRoot, unauthorizedRoot, { recursive: true });
  await makeWritable(unauthorizedRoot);
  const unauthorizedPriv = path.join(unauthorizedRoot, 'private-review');
  const unauthorizedApproval = await json(path.join(unauthorizedPriv, 'approval-manifest.json'));
  unauthorizedApproval.records[0].sourceFingerprint = '0'.repeat(64);
  await fs.writeFile(path.join(unauthorizedPriv, 'approval-manifest.json'), JSON.stringify(unauthorizedApproval, null, 2) + '\n');
  const unauthorizedSnapshot = await digestFile(path.join(unauthorizedRoot, 'data/approved/snapshot.json'));
  const unauthorizedHistoryFiles = await fs.readdir(path.join(unauthorizedRoot, 'data/approved/history'));
  const exportFailure = run('export-approved-data.mjs', { LARI_SITE_ROOT: unauthorizedRoot, LARI_PRIVATE_REVIEW_DIR: unauthorizedPriv, LARI_REPORT_PATH: reportPath, LARI_SCAN_OUTPUT_PATH: path.join(unauthorizedPriv, 'research-scan.json') });
  assert.notEqual(exportFailure.status, 0);
  assert.match(exportFailure.stderr, /source fingerprint is stale|Export rejected/);
  assert.equal(await digestFile(path.join(unauthorizedRoot, 'data/approved/snapshot.json')), unauthorizedSnapshot);
  assert.deepEqual(await fs.readdir(path.join(unauthorizedRoot, 'data/approved/history')), unauthorizedHistoryFiles);
  const unauthorizedQueuePath = path.join(unauthorizedRoot, 'data/review-queue/records.json');
  const badAllowlistQueue = await json(unauthorizedQueuePath);
  badAllowlistQueue[0].privateEvidencePath = 'D:\\Users\\owner\\private.json';
  await fs.writeFile(unauthorizedQueuePath, JSON.stringify(badAllowlistQueue, null, 2) + '\n');
  const allowlistFailure = run('export-approved-data.mjs', { LARI_SITE_ROOT: unauthorizedRoot, LARI_PRIVATE_REVIEW_DIR: unauthorizedPriv, LARI_REPORT_PATH: reportPath, LARI_SCAN_OUTPUT_PATH: path.join(unauthorizedPriv, 'research-scan.json') });
  assert.notEqual(allowlistFailure.status, 0);
  assert.match(allowlistFailure.stderr, /fields outside the publication allowlist/);
  assert.equal(await digestFile(path.join(unauthorizedRoot, 'data/approved/snapshot.json')), unauthorizedSnapshot);
  const privacyQueue = await json(unauthorizedQueuePath);
  delete privacyQueue[0].privateEvidencePath;
  privacyQueue[0].publicProvenance = 'Private source D:\\Users\\owner\\secret.json';
  await fs.writeFile(unauthorizedQueuePath, JSON.stringify(privacyQueue, null, 2) + '\n');
  const privacyFailure = run('export-approved-data.mjs', { LARI_SITE_ROOT: unauthorizedRoot, LARI_PRIVATE_REVIEW_DIR: unauthorizedPriv, LARI_REPORT_PATH: reportPath, LARI_SCAN_OUTPUT_PATH: path.join(unauthorizedPriv, 'research-scan.json') });
  assert.notEqual(privacyFailure.status, 0);
  assert.match(privacyFailure.stderr, /filesystem path detected/);
  assert.equal(await digestFile(path.join(unauthorizedRoot, 'data/approved/snapshot.json')), unauthorizedSnapshot);
  assert.deepEqual(await fs.readdir(path.join(unauthorizedRoot, 'data/approved/history')), unauthorizedHistoryFiles);
  testResults.push('Stale, non-allowlisted, and privacy-sensitive exports all fail before any snapshot or history write.');

  const privacyIssue = scanPublicText({ publicProvenance: 'Private source D:\\Users\\owner\\secret.json' });
  assert.ok(privacyIssue.length > 0);
  testResults.push('Privacy-sensitive paths are rejected by the existing public-text scanner.');

  const transition = await json(apply.journalPath);
  transition.status = 'prepared';
  await fs.writeFile(apply.journalPath, JSON.stringify(transition, null, 2) + '\n');
  const recovered = await recoverPreparedRebindings(fixtureRoot);
  assert.equal(recovered.find(item => item.transitionId === apply.transitionId)?.status, 'committed-recovered');
  testResults.push('Prepared rebinding journal recovers to committed-recovered when the exact after-hash is present.');

  const finalEventLog = await readDecisionEventLog(path.join(privateDir, 'decision-events.jsonl'));
  assert.equal(finalEventLog.errors.length, 0);
  assert.equal(await digestFile(path.join(fixtureRoot, 'data/approved/snapshot.json')), oldSnapshotHash);
  process.stdout.write(testResults.map((result, index) => `${index + 1}. PASS — ${result}`).join('\n') + '\n');
} finally {
  delete process.env.LARI_REPORT_PATH;
  await fs.rm(tempRoot, { recursive: true, force: true });
}
