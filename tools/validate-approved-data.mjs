import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { validateSnapshot, scanPublicText } from './data-schema.mjs';
import { validateApprovalSet } from './approval-validation.mjs';
import { readDecisionEventLog } from './decision-history.mjs';

const root = path.resolve(process.env.LARI_SITE_ROOT || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'));
const privateDir = path.resolve(process.env.LARI_PRIVATE_REVIEW_DIR || path.join(root, 'private-review'));
const reportPath = process.env.LARI_REPORT_PATH;
if (!reportPath) throw new Error('Set LARI_REPORT_PATH to the designated local source report; private source paths are not embedded in this public repository.');
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const [report, approval, records, snapshot] = await Promise.all([
  fs.readFile(reportPath, 'utf8'),
  fs.readFile(path.join(privateDir, 'approval-manifest.json'), 'utf8').then(JSON.parse),
  fs.readFile(path.join(root, 'data/review-queue/records.json'), 'utf8').then(JSON.parse),
  fs.readFile(path.join(root, 'data/approved/snapshot.json'), 'utf8').then(JSON.parse)
]);
const sha = hash(report), fingerprint = report.match(/Source fingerprint:\s*`?([a-f0-9]{64})/i)?.[1] || null;
const scan = JSON.parse(await fs.readFile(process.env.LARI_SCAN_OUTPUT_PATH || path.join(privateDir, 'research-scan.json'), 'utf8').catch(() => '{"entries":[],"source":{}}'));
const eventLog = await readDecisionEventLog(process.env.LARI_DECISION_EVENTS_PATH || path.join(privateDir, 'decision-events.jsonl'));
const decisionEvents = eventLog.events;
if (eventLog.errors.length) process.stderr.write(`Decision history invalid: ${eventLog.errors.join('; ')}\n`);
let proposalManifest = null, proposalBytes = Buffer.alloc(0), editorialBytes = Buffer.alloc(0);
try {
  proposalBytes = await fs.readFile(path.join(privateDir, 'launch-proposals.json'));
  proposalManifest = JSON.parse(proposalBytes.toString('utf8'));
  editorialBytes = await fs.readFile(path.join(privateDir, proposalManifest.editorialFile || 'LARI_LIVE_LAUNCH_REVIEW.md'));
} catch { /* Non-editorial records do not require proposal inputs. */ }
const errors = [...validateSnapshot(snapshot), ...scanPublicText(snapshot)];
if (!Array.isArray(records) || !Array.isArray(approval.records) || !Array.isArray(approval.recordIds)) errors.push('review queue, approval IDs, and per-record approval receipts must be arrays');
else if (records.length !== approval.recordIds.length || JSON.stringify([...records.map(r => r.id)].sort()) !== JSON.stringify([...approval.recordIds].sort())) errors.push('approval IDs must exactly match staged records');
if (scan.source?.reportSha256 !== sha || scan.source?.sourceFingerprint !== fingerprint) errors.push('private scan is stale; run npm run research:scan before validation');
if (records.length) errors.push(...await validateApprovalSet({ records, approval, scan, reportText: report, sourceRoot: path.dirname(path.resolve(reportPath)), decisionEvents, proposalManifest, proposalBytes, editorialBytes }));
const allowed = new Set(['id','title','summary','status','sourceRecordId','measuredAt','evaluationMethod','verificationStatus','reportVersion','publishedAt','collection','limitations','result','environment','measurements','researchQuestion','researchArea','researchAreas','revision','architectureComponent','whyItMatters','baseline','candidateMethod','comparisonConditions','outcome','lifecycleStatus','externalModelUsage','coldReloadResult','causalAblationResult','transferResult','relatedExperimentIds','relationships','publicProvenance','sourceFingerprint','lastReviewedAt','measurementConditions']);
for (const record of records || []) {
  if (Object.keys(record).some(key => !allowed.has(key))) errors.push(`record ${record.id} contains a non-allowlisted key`);
  errors.push(...scanPublicText(record).map(problem => `${record.id}: ${problem}`));
}
if (errors.length) { process.stderr.write(`Approved data validation failed:\n- ${errors.join('\n- ')}\n`); process.exitCode = 1; }
else process.stdout.write(`Approval and public-data validation passed. ${records.length} currently owner-authorized staging record(s) (individual or batch); ${snapshot.entryCount || 0} currently exported public record(s).\n`);
