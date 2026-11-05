import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { applyRebindingPlan, buildRebindingPlan, recoverPreparedRebindings } from './publication-lineage.mjs';

const root = path.resolve(process.env.LARI_SITE_ROOT || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'));
const privateDir = path.join(root, 'private-review');
const args = process.argv.slice(2);
const valueAfter = key => { const index = args.indexOf(key); return index >= 0 ? args[index + 1] : null; };
const reportPath = process.env.LARI_REPORT_PATH;
if (!reportPath) throw new Error('Set LARI_REPORT_PATH to the designated local source report.');

if (args.includes('--recover')) {
  const results = await recoverPreparedRebindings(root);
  process.stdout.write(JSON.stringify({ recovered: results }, null, 2) + '\n');
} else if (args.includes('--apply')) {
  const planPath = valueAfter('--plan');
  const confirmation = valueAfter('--confirm');
  if (!planPath || !confirmation) throw new Error('Apply requires --plan <reviewed-plan.json> and --confirm "APPLY REBIND PLAN <plan-sha256>".');
  const resolvedPlan = path.resolve(planPath);
  const relative = path.relative(privateDir, resolvedPlan);
  if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('Rebinding plan must be stored in the ignored private-review directory.');
  const result = await applyRebindingPlan({ siteRoot: root, planPath: resolvedPlan, confirmation });
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
} else {
  const [reportText, proposalBytes, approvalText, recordsText, ledgerText] = await Promise.all([
    fs.readFile(reportPath, 'utf8'),
    fs.readFile(path.join(privateDir, 'launch-proposals.json')),
    fs.readFile(path.join(privateDir, 'approval-manifest.json'), 'utf8'),
    fs.readFile(path.join(root, 'data/review-queue/records.json'), 'utf8'),
    fs.readFile(path.join(privateDir, 'research-ledger.jsonl'), 'utf8')
  ]);
  const proposals = JSON.parse(proposalBytes.toString('utf8'));
  const editorialBytes = await fs.readFile(path.join(privateDir, proposals.editorialFile || 'LARI_LIVE_LAUNCH_REVIEW.md'));
  const ledgerEntries = ledgerText.split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line));
  const plan = await buildRebindingPlan({
    reportText, sourceRoot: path.dirname(reportPath), proposalBytes, editorialBytes,
    approval: JSON.parse(approvalText), records: JSON.parse(recordsText), ledgerEntries
  });
  const outputPath = valueAfter('--write-plan');
  if (outputPath) {
    const resolved = path.resolve(outputPath);
    const relative = path.relative(privateDir, resolved);
    if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('Plan output must remain inside ignored private-review.');
    await fs.mkdir(path.dirname(resolved), { recursive: true });
    await fs.writeFile(resolved, JSON.stringify(plan, null, 2) + '\n', { flag: 'wx' });
  }
  process.stdout.write(JSON.stringify(plan, null, 2) + '\n');
  if (plan.status !== 'ready-to-rebind-proposals; owner reauthorization still required') process.exitCode = 2;
}
