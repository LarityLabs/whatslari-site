import crypto from 'node:crypto';

export const snapshotSchema = {
  schemaVersion: 2,
  status: ['approved', 'no-approved-public-data'],
  collections: ['experiments', 'capabilities', 'milestones', 'metrics']
};

export function validateSnapshot(data) {
  const errors = [];
  if (!data || data.schemaVersion !== snapshotSchema.schemaVersion) errors.push('schemaVersion must be 2');
  if (!snapshotSchema.status.includes(data?.status)) errors.push('status is invalid');
  if (!Array.isArray(data?.experiments) || !Array.isArray(data?.capabilities)
    || !Array.isArray(data?.milestones) || !Array.isArray(data?.metrics)) errors.push('all collections must be arrays');
  if (data?.status === 'no-approved-public-data' && snapshotSchema.collections.some(key => data?.[key]?.length)) {
    errors.push('empty status cannot contain records');
  }
  const allRows = snapshotSchema.collections.flatMap(key => data?.[key] || []);
  const ids = allRows.map(row => row?.id).filter(Boolean);
  if (new Set(ids).size !== ids.length) errors.push('public record IDs must be unique across collections');
  if (data?.status === 'approved') {
    if (!/^snapshot-\d{14}$/.test(data.snapshotId || '')) errors.push('approved snapshot requires a stable snapshotId');
    if (data.entryCount !== allRows.length) errors.push('snapshot entryCount does not match its records');
    if (!/^[a-f0-9]{64}$/i.test(data.contentDigest || '')) errors.push('approved snapshot requires a contentDigest');
    if (typeof data?.sourceReport?.version !== 'string' || !data.sourceReport.version.trim()) errors.push('approved snapshot requires a public-safe source report version label');
    if (data?.sourceReport?.sha256 || data?.sourceReport?.fingerprint) errors.push('private source hashes must remain in the ignored approval manifest, not the public snapshot');
    if (!data.publishedAt) errors.push('approved snapshot requires publishedAt');
    const expected = crypto.createHash('sha256').update(JSON.stringify({ ...data, contentDigest: null })).digest('hex');
    if (data.contentDigest !== expected) errors.push('snapshot contentDigest does not match public content');
  }
  for (const key of snapshotSchema.collections) {
    for (const row of data?.[key] || []) {
      if (!row || typeof row !== 'object' || Array.isArray(row)) { errors.push(`${key} contains a non-object`); continue; }
      for (const field of ['id', 'title', 'summary', 'status', 'sourceRecordId', 'measuredAt', 'evaluationMethod', 'verificationStatus', 'reportVersion', 'publishedAt']) {
        if (typeof row[field] !== 'string' || !row[field].trim()) errors.push(`${key} record is missing ${field}`);
      }
      if (typeof row.id === 'string' && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(row.id)) errors.push(`${key} record has an invalid public URL id`);
      if (row.limitations !== undefined && typeof row.limitations !== 'string') errors.push(`${key} record ${row.id || '(unknown)'} has invalid limitations`);
      if (row.result !== undefined && typeof row.result !== 'string') errors.push(`${key} record ${row.id || '(unknown)'} has invalid result`);
      if (row.environment !== undefined && typeof row.environment !== 'string') errors.push(`${key} record ${row.id || '(unknown)'} has invalid environment`);
      if (row.measurements !== undefined && (!row.measurements || typeof row.measurements !== 'object' || Array.isArray(row.measurements) || Object.entries(row.measurements).some(([name, value]) => !/^[A-Za-z][A-Za-z0-9]*$/.test(name) || !['string', 'number', 'boolean'].includes(typeof value) || (typeof value === 'number' && !Number.isFinite(value))))) errors.push(`${key} record ${row.id || '(unknown)'} has invalid measurements`);
      if (!['hypothesis', 'experimental', 'demonstrated', 'independently-reproduced', 'production-qualified', 'negative-result'].includes(row.status)) errors.push(`${key} record ${row.id || '(unknown)'} has invalid status`);
      if (!['unverified', 'verified', 'independently-reproduced', 'not-applicable'].includes(row.verificationStatus)) errors.push(`${key} record ${row.id || '(unknown)'} has invalid verificationStatus`);
      const strings = ['researchQuestion','researchArea','architectureComponent','baseline','candidateMethod','outcome','lifecycleStatus','externalModelUsage','coldReloadResult','causalAblationResult','transferResult','relatedExperimentIds','publicProvenance','whyItMatters','sourceFingerprint','lastReviewedAt'];
      for (const field of strings) if (row[field] !== undefined && row[field] !== null && typeof row[field] !== 'string' && !(field === 'relatedExperimentIds' && Array.isArray(row[field]))) errors.push(`${key} record ${row.id || '(unknown)'} has invalid ${field}`);
      if (row.relationships !== undefined && (!Array.isArray(row.relationships) || row.relationships.some(item => !item || !['supersedes','superseded-by','follow-up-to','replicates','contradicts','builds-upon','related'].includes(item.type) || typeof item.recordId !== 'string'))) errors.push(`${key} record ${row.id || '(unknown)'} has invalid relationships`);
      if (row.measurements !== undefined && Object.keys(row.measurements).length > 0 && (!row.measurementConditions || typeof row.measurementConditions !== 'string')) errors.push(`${key} record ${row.id || '(unknown)'} measurements require measurementConditions`);
    }
  }
  const idSet = new Set(ids);
  for (const row of allRows) {
    for (const relation of row?.relationships || []) if (!idSet.has(relation.recordId)) errors.push(`record ${row.id} relationship points to unknown record ${relation.recordId}`);
    for (const relatedId of row?.relatedExperimentIds || []) if (!idSet.has(relatedId)) errors.push(`record ${row.id} relatedExperimentIds points to unknown record ${relatedId}`);
    if (row?.architectureComponent && !['request','kernel','state','execution','persistence','governance'].includes(row.architectureComponent)) errors.push(`record ${row.id} has an unknown architectureComponent`);
    if (row?.sourceFingerprint && !/^[a-f0-9]{64}$/i.test(row.sourceFingerprint)) errors.push(`record ${row.id} has an invalid sourceFingerprint`);
  }
  return errors;
}

export function scanPublicText(value) {
  const text = JSON.stringify(value);
  const issues = [];
  if (/(?:[A-Za-z]:\\Users\\|\/home\/[^/]+\/|\/root\/|\\\\[A-Za-z0-9_.-]+\\)/i.test(text)) issues.push('filesystem path detected');
  if (/(?:\b(?:api[_ -]?key|access[_ -]?token|password|secret)\b\s*[:=]\s*["'][^"']{4,})/i.test(text)) issues.push('credential-like field detected');
  if (/\b(?:10(?:\.\d{1,3}){3}|192\.168(?:\.\d{1,3}){2}|172\.(?:1[6-9]|2\d|3[01])(?:\.\d{1,3}){2})\b/.test(text)) issues.push('private network address detected');
  if (/lari\.learned\.[a-z0-9._-]+/i.test(text)) issues.push('internal learned-record identifier detected');
  if (/(?:D:|C:)\\Lari-workspace\\|LARI_FULL_REPORT\.md|private-review/i.test(text)) issues.push('private workspace or review reference detected');
  if (/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(text)) issues.push('private key material detected');
  return issues;
}
