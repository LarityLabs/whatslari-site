import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { validateSnapshot, scanPublicText } from './data-schema.mjs';
import { validateApprovalSet } from './approval-validation.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const digest = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const approval = JSON.parse(await fs.readFile(path.join(root, 'private-review/approval-manifest.json'), 'utf8'));
if (approval.schemaVersion !== 2 || approval.status !== 'approved') throw new Error('Publication approval is not active. Use the local research review workflow to approve individual records first.');
if (!approval.approver || !approval.approvedAt || !/^[a-f0-9]{64}$/i.test(approval.sourceReportSha256 || '') || !Array.isArray(approval.recordIds)) throw new Error('Approval must name an approver, timestamp, source report SHA-256, and record IDs.');
if (Date.parse(approval.approvedAt) > Date.now()) throw new Error('Approval timestamp is in the future.');
const records = JSON.parse(await fs.readFile(path.join(root, 'data/review-queue/records.json'), 'utf8'));
if (!Array.isArray(records)) throw new Error('Review queue must be an array.');
const ids = records.map(row => row?.id);
if (new Set(ids).size !== ids.length || JSON.stringify([...approval.recordIds].sort()) !== JSON.stringify([...ids].sort())) throw new Error('Approval record IDs must exactly match the review queue.');
const reportPath = process.env.LARI_REPORT_PATH;
if (!reportPath) throw new Error('Set LARI_REPORT_PATH to the designated local source report; private source paths are not embedded in this public repository.');
const report = await fs.readFile(reportPath, 'utf8');
const sourceReportSha256 = crypto.createHash('sha256').update(report).digest('hex');
const sourceFingerprint = report.match(/Source fingerprint:\s*`?([a-f0-9]{64})/i)?.[1] || null;
const scan = JSON.parse(await fs.readFile(path.join(root, 'private-review/research-scan.json'), 'utf8'));
if (scan.source.reportSha256 !== sourceReportSha256 || scan.source.sourceFingerprint !== sourceFingerprint) throw new Error('The private research scan is stale. Run npm run research:scan, review changed entries, then validate again.');
const allowedFields = ['id','title','summary','status','sourceRecordId','measuredAt','evaluationMethod','verificationStatus','reportVersion','publishedAt','collection','limitations','result','environment','measurements','researchQuestion','researchArea','researchAreas','revision','architectureComponent','whyItMatters','baseline','candidateMethod','comparisonConditions','outcome','lifecycleStatus','externalModelUsage','coldReloadResult','causalAblationResult','transferResult','relatedExperimentIds','relationships','publicProvenance','sourceFingerprint','lastReviewedAt','measurementConditions'];
const approvalIssues = validateApprovalSet({ records, approval, scan, reportText: report });
if (approvalIssues.length) throw new Error(`Export rejected:\n- ${approvalIssues.join('\n- ')}`);
const publishedAt = new Date().toISOString();
const output = { schemaVersion: 2, snapshotId: `snapshot-${publishedAt.slice(0,19).replace(/[-:T]/g,'')}`, status: records.length ? 'approved' : 'no-approved-public-data', publishedAt, generatedAt: publishedAt, entryCount: records.length, sourceReport: { version: 'Owner-reviewed LARI research source snapshot · 2026-10-31' }, previousSnapshotId: null, contentDigest: null, experiments: [], capabilities: [], milestones: [], metrics: [] };
for (const record of records) {
  if (!record || Object.keys(record).some(key => !allowedFields.includes(key))) throw new Error(`Record ${record?.id || '(unknown)'} has fields outside the publication allowlist.`);
  const { collection, ...fields } = record;
  if (!['experiments', 'capabilities', 'milestones', 'metrics'].includes(collection)) throw new Error(`Record ${record.id} has an invalid collection.`);
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(fields.id || '')) throw new Error(`Record ${record.id} has an invalid public URL id.`);
  if (fields.environment === null) delete fields.environment;
  fields.publishedAt = publishedAt;
  output[collection].push(fields);
}
const previousPath = path.join(root, 'data/approved/snapshot.json');
const previous = JSON.parse(await fs.readFile(previousPath, 'utf8'));
if (previous.status === 'approved' && previous.contentDigest) {
  output.previousSnapshotId = previous.snapshotId;
  const historyPath = path.join(root, 'data/approved/history', `${previous.snapshotId}.json`);
  await fs.mkdir(path.dirname(historyPath), { recursive: true });
  await fs.writeFile(historyPath, `${JSON.stringify(previous, null, 2)}\n`, 'utf8');
}
output.contentDigest = digest({ ...output, contentDigest: null });
const problems = [...validateSnapshot(output), ...scanPublicText(output)];
if (problems.length) throw new Error(`Export failed validation:\n- ${problems.join('\n- ')}`);
await fs.writeFile(path.join(root, 'data/approved/snapshot.json'), `${JSON.stringify(output, null, 2)}\n`, 'utf8');
process.stdout.write(`Exported ${records.length} approved public record(s). No remote publication was performed.\n`);
