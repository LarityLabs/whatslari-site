import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'lari-snapshot-rollback-'));
const approved = path.join(temp, 'data/approved');
const build = (snapshotId, title) => {
  const value = { schemaVersion: 2, snapshotId, status: 'approved', publishedAt: '2026-11-01T00:00:00.000Z', generatedAt: '2026-11-01T00:00:00.000Z', entryCount: 1, sourceReport: { version: 'isolated rollback fixture' }, previousSnapshotId: null, contentDigest: null, experiments: [{ id: 'rollback-fixture', title, summary: 'Test-only rollback data.', status: 'experimental', sourceRecordId: 'Test fixture', measuredAt: '2026-11-01T00:00:00.000Z', evaluationMethod: 'Isolated rollback test', verificationStatus: 'verified', reportVersion: 'fixture', publishedAt: '2026-11-01T00:00:00.000Z' }], capabilities: [], milestones: [], metrics: [] };
  value.contentDigest = crypto.createHash('sha256').update(JSON.stringify({ ...value, contentDigest: null })).digest('hex');
  return value;
};
try {
  const old = build('snapshot-20261101000000', 'Prior approved test snapshot');
  const current = build('snapshot-20261102000000', 'Current approved test snapshot');
  await fs.mkdir(path.join(approved, 'history'), { recursive: true });
  await fs.mkdir(path.join(temp, 'private-review'), { recursive: true });
  await fs.writeFile(path.join(approved, 'snapshot.json'), `${JSON.stringify(current, null, 2)}\n`);
  await fs.writeFile(path.join(approved, 'history', `${old.snapshotId}.json`), `${JSON.stringify(old, null, 2)}\n`);
  const run = spawnSync(process.execPath, [path.join(root, 'tools/rollback-approved-snapshot.mjs'), old.snapshotId, 'isolated test rollback reason'], { cwd: root, env: { ...process.env, LARI_SITE_ROOT: temp }, encoding: 'utf8' });
  assert.equal(run.status, 0, `rollback command succeeds: ${run.stderr}`);
  assert.deepEqual(JSON.parse(await fs.readFile(path.join(approved, 'snapshot.json'), 'utf8')), old, 'rollback restores the immutable prior snapshot exactly');
  assert.deepEqual(JSON.parse(await fs.readFile(path.join(approved, 'history', `${current.snapshotId}.json`), 'utf8')), current, 'the current snapshot is preserved in history');
  const log = (await fs.readFile(path.join(temp, 'private-review/rollback-log.jsonl'), 'utf8')).trim().split(/\r?\n/).map(JSON.parse);
  assert.equal(log.length, 1);
  assert.equal(log[0].publicPublishPerformed, false);
  const shortReason = spawnSync(process.execPath, [path.join(root, 'tools/rollback-approved-snapshot.mjs'), old.snapshotId, 'short'], { cwd: root, env: { ...process.env, LARI_SITE_ROOT: temp }, encoding: 'utf8' });
  assert.notEqual(shortReason.status, 0, 'rollback refuses a missing audit reason');
  process.stdout.write('Approved snapshot rollback, preservation, and private audit logging tests passed.\n');
} finally { await fs.rm(temp, { recursive: true, force: true }); }
