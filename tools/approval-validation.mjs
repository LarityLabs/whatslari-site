import crypto from 'node:crypto';

export const stableStringify = value => JSON.stringify(value, (_key, item) => item && typeof item === 'object' && !Array.isArray(item) ? Object.fromEntries(Object.keys(item).sort().map(key => [key,item[key]])) : item);
export const hashPublicContent = value => crypto.createHash('sha256').update(stableStringify(value)).digest('hex');
const sha = value => crypto.createHash('sha256').update(value).digest('hex');
export function validateApprovalSet({ records, approval, scan, reportText }) {
  const errors = [];
  const reportSha256 = sha(reportText);
  const fingerprint = reportText.match(/Source fingerprint:\s*`?([a-f0-9]{64})/i)?.[1] || null;
  if (approval?.schemaVersion !== 2 || approval.status !== 'approved') errors.push('approval manifest is not active');
  if (!Array.isArray(records) || !Array.isArray(approval?.records) || !Array.isArray(approval?.recordIds)) errors.push('records and per-record approvals must be arrays');
  if (Array.isArray(records) && Array.isArray(approval?.recordIds) && JSON.stringify([...records.map(row => row.id)].sort()) !== JSON.stringify([...approval.recordIds].sort())) errors.push('approved IDs do not exactly match staged records');
  if (scan?.source?.reportSha256 !== reportSha256 || scan?.source?.sourceFingerprint !== fingerprint) errors.push('private scan is stale against the canonical report');
  for (const record of records || []) {
    const receipt = approval.records?.find(row => row.recordId === record.id);
    const sourceEntry = scan?.entries?.find(row => row.scanId === receipt?.scanId);
    const content = { ...record, publishedAt: null };
    if (!receipt || !['approved','approved-edited'].includes(receipt.decision)) { errors.push(`record ${record.id} has no explicit owner approval`); continue; }
    if (!sourceEntry || receipt.sectionSha256 !== sourceEntry.sectionSha256 || receipt.evidenceDigest !== sourceEntry.evidenceDigest) errors.push(`record ${record.id} source section or linked evidence changed since review`);
    if (receipt.approvedContentSha256 !== hashPublicContent(content)) errors.push(`record ${record.id} public content changed since approval`);
  }
  if (Array.isArray(approval?.records) && Array.isArray(records) && approval.records.length !== records.length) errors.push('approval receipt count does not match staged record count');
  return errors;
}
