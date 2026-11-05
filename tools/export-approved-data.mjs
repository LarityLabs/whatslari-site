import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { validateSnapshot, scanPublicText } from './data-schema.mjs';
import { validateApprovalSet } from './approval-validation.mjs';
import { readDecisionEventLog } from './decision-history.mjs';

const root = path.resolve(process.env.LARI_SITE_ROOT || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'));
const privateDir = path.resolve(process.env.LARI_PRIVATE_REVIEW_DIR || path.join(root, 'private-review'));
const reportPath = process.env.LARI_REPORT_PATH && path.resolve(process.env.LARI_REPORT_PATH);
if (!reportPath) throw new Error('Set LARI_REPORT_PATH to the designated local source report; private source paths are not embedded in this public repository.');
const digest = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const [report, approval, records, previous] = await Promise.all([
  fs.readFile(reportPath, 'utf8'),
  fs.readFile(path.join(privateDir, 'approval-manifest.json'), 'utf8').then(JSON.parse),
  fs.readFile(path.join(root, 'data/review-queue/records.json'), 'utf8').then(JSON.parse),
  fs.readFile(path.join(root, 'data/approved/snapshot.json'), 'utf8').then(JSON.parse)
]);
if (approval?.schemaVersion !== 3 || approval.status !== 'approved') throw new Error('Publication approval is not active under current schema 3 source-bound authorization. Legacy approvals require fresh owner review.');
if (!Array.isArray(records) || !records.length || !Array.isArray(approval.recordIds)) throw new Error('Review queue and current approval IDs must be nonempty arrays.');
const reportSha256 = crypto.createHash('sha256').update(report).digest('hex');
const sourceFingerprint = report.match(/Source fingerprint:\s*`?([a-f0-9]{64})/i)?.[1] || null;
const scan = JSON.parse(await fs.readFile(process.env.LARI_SCAN_OUTPUT_PATH || path.join(privateDir, 'research-scan.json'), 'utf8'));
const eventLog = await readDecisionEventLog(process.env.LARI_DECISION_EVENTS_PATH || path.join(privateDir, 'decision-events.jsonl'));
if (eventLog.errors.length) throw new Error('Export rejected: decision history is invalid: ' + eventLog.errors.join('; '));
let proposalManifest = null, proposalBytes = Buffer.alloc(0), editorialBytes = Buffer.alloc(0);
try {
  proposalBytes = await fs.readFile(path.join(privateDir, 'launch-proposals.json'));
  proposalManifest = JSON.parse(proposalBytes.toString('utf8'));
  editorialBytes = await fs.readFile(path.join(privateDir, proposalManifest.editorialFile || 'LARI_LIVE_LAUNCH_REVIEW.md'));
} catch { /* Validator reports missing proposal lineage for editorial entries. */ }
if (scan.source?.reportSha256 !== reportSha256 || scan.source?.sourceFingerprint !== sourceFingerprint) throw new Error('The private research scan is stale against the canonical report.');

const allowedFields = new Set(['id','title','summary','status','sourceRecordId','measuredAt','evaluationMethod','verificationStatus','reportVersion','publishedAt','collection','limitations','result','environment','measurements','researchQuestion','researchArea','researchAreas','revision','architectureComponent','whyItMatters','baseline','candidateMethod','comparisonConditions','outcome','lifecycleStatus','externalModelUsage','coldReloadResult','causalAblationResult','transferResult','relatedExperimentIds','relationships','publicProvenance','sourceFingerprint','lastReviewedAt','measurementConditions']);
const problems = [...await validateApprovalSet({
  records, approval, scan, reportText: report, sourceRoot: path.dirname(reportPath), decisionEvents: eventLog.events,
  proposalManifest, proposalBytes, editorialBytes
})];
const ids = records.map(row => row?.id);
if (new Set(ids).size !== ids.length) problems.push('review queue contains duplicate stable public IDs');
for (const record of records) {
  if (!record || Object.keys(record).some(key => !allowedFields.has(key))) problems.push(`record ${record?.id || '(unknown)'} has fields outside the publication allowlist`);
  problems.push(...scanPublicText(record).map(problem => `${record?.id || '(unknown)'}: ${problem}`));
}
if (problems.length) throw new Error(`Export rejected before any file writes:\n- ${[...new Set(problems)].join('\n- ')}`);

const publishedAt = new Date().toISOString();
const generatedAt = new Date().toISOString();
const output = { schemaVersion: 2, snapshotId: `snapshot-${publishedAt.slice(0,19).replace(/[-:T]/g,'')}`, status: 'approved', publishedAt, generatedAt, entryCount: records.length, sourceReport: { version: `Owner-reviewed LARI research source snapshot · ${report.match(/Generated:\s*`?([^\r\n`]+)/i)?.[1]?.trim() || 'date not stated'}` }, previousSnapshotId: null, contentDigest: null, experiments: [], capabilities: [], milestones: [], metrics: [] };
for (const record of records) {
  const { collection, ...fields } = record;
  if (!['experiments','capabilities','milestones','metrics'].includes(collection)) throw new Error(`Record ${record.id} has an invalid collection.`);
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(fields.id || '')) throw new Error(`Record ${record.id} has an invalid public URL ID.`);
  if (fields.environment === null) delete fields.environment;
  fields.publishedAt = publishedAt;
  output[collection].push(fields);
}
if (previous.status === 'approved' && previous.contentDigest) output.previousSnapshotId = previous.snapshotId;
output.contentDigest = digest({ ...output, contentDigest: null });
const snapshotProblems = [...validateSnapshot(output), ...scanPublicText(output)];
if (snapshotProblems.length) throw new Error(`Export preflight rejected before any file writes:\n- ${snapshotProblems.join('\n- ')}`);
if (process.env.LARI_EXPORT_PREFLIGHT_ONLY === '1') {
  process.stdout.write(JSON.stringify({ status: 'preflight-passed-no-write', recordCount: records.length, recordIds: records.map(record => record.id), candidateContentDigest: output.contentDigest, preservedSnapshotSha256: crypto.createHash('sha256').update(JSON.stringify(previous, null, 2) + '\n').digest('hex') }) + '\n');
  process.exit(0);
}

const snapshotPath = path.join(root, 'data/approved/snapshot.json');
const historyPath = previous.status === 'approved' && previous.contentDigest
  ? path.join(root, 'data/approved/history', `${previous.snapshotId}.json`) : null;
const previousBytes = historyPath ? await fs.readFile(snapshotPath) : null;
if (historyPath) {
  const priorHistory = await fs.readFile(historyPath).catch(error => error.code === 'ENOENT' ? null : Promise.reject(error));
  if (priorHistory && !priorHistory.equals(previousBytes)) throw new Error('Existing snapshot history path contains different bytes; export stopped before writing.');
}
if (historyPath) {
  await fs.mkdir(path.dirname(historyPath), { recursive: true });
  try { await fs.writeFile(historyPath, previousBytes, { flag: 'wx' }); }
  catch (error) { if (error.code !== 'EEXIST') throw error; }
}
const temp = snapshotPath + '.' + crypto.randomUUID() + '.tmp';
await fs.writeFile(temp, `${JSON.stringify(output, null, 2)}\n`, { flag: 'wx' });
await fs.rename(temp, snapshotPath);
process.stdout.write(`Exported ${records.length} currently authorized public record(s). No remote publication was performed.\n`);
