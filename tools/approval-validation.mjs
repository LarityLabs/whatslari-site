import { validateDecisionEventLog, authorizationPhrase } from './decision-history.mjs';
import { hashPublicContent, sha256, stableStringify } from './publication-crypto.mjs';
import { getSectionByTitle, extractReportSections, resolveEvidenceReferences, referenceTuples, expandEditorialRecords } from './publication-lineage.mjs';

export { stableStringify, hashPublicContent } from './publication-crypto.mjs';

const isSha = value => typeof value === 'string' && /^[a-f0-9]{64}$/i.test(value);
const collections = new Set(['experiments','capabilities','milestones','metrics']);

function reportIdentity(reportText) {
  return {
    reportSha256: sha256(reportText),
    sourceFingerprint: reportText.match(/Source fingerprint:\s*`?([a-f0-9]{64})/i)?.[1] || null
  };
}

function sourceLinks(body) {
  return [...new Set([...body.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)].map(match => match[1]).filter(ref => !/^https?:/i.test(ref)))];
}

function batchAuthorizationMatches(event, decisionEvents, record, contentHash) {
  const auth = event?.authorization || {};
  if (auth.method !== 'owner-authorized-batch-record' || auth.phraseMatched !== true) return false;
  const batchEvent = (decisionEvents || []).find(row => row.eventId === auth.batchAuthorizationEventId);
  if (!batchEvent || batchEvent.eventType !== 'owner-batch-authorization' || batchEvent.decision !== 'batch-authorized' || batchEvent.reviewer !== event.reviewer) return false;
  const batchAuth = batchEvent.authorization || {};
  if (batchAuth.method !== 'owner-authorized-batch-manifest' || batchAuth.channel !== 'interactive-console' || batchAuth.phraseMatched !== true) return false;
  if (typeof batchAuth.manifestRaw !== 'string' || sha256(batchAuth.manifestRaw) !== batchAuth.manifestFileSha256) return false;
  const expectedBatchPhrase = 'AUTHORIZE BATCH ' + batchAuth.manifestFileSha256;
  if (batchAuth.expectedPhrase !== expectedBatchPhrase || batchAuth.acceptedPhrase !== expectedBatchPhrase || auth.batchManifestFileSha256 !== batchAuth.manifestFileSha256 || auth.expectedPhrase !== expectedBatchPhrase || auth.acceptedPhrase !== expectedBatchPhrase) return false;
  let manifest;
  try { manifest = JSON.parse(batchAuth.manifestRaw); } catch { return false; }
  const { manifestSha256, ...payload } = manifest || {};
  if (!/^[a-f0-9]{64}$/i.test(manifestSha256 || '') || sha256(stableStringify(payload)) !== manifestSha256) return false;
  if (manifest.source?.reportSha256 !== event.sourceReportSha256 || manifest.source?.sourceFingerprint !== event.sourceFingerprint) return false;
  const matching = manifest.records?.filter(row => row.recordId === record.id) || [];
  if (matching.length !== 1) return false;
  const item = matching[0];
  return item.classification === 'PASS'
    && manifest.scope?.includedRecordIds?.includes(record.id)
    && item.scanId === event.scanId
    && item.collection === record.collection
    && item.currentPublicContentSha256 === contentHash
    && item.currentSourceSectionSha256 === event.sectionSha256
    && item.evidenceDigest === event.evidenceDigest
    && stableStringify(item.evidenceReferences || []) === stableStringify(event.evidenceReferences || []);
}

function findEditorialProposal(entry, proposalManifest) {
  const matches = expandEditorialRecords(proposalManifest || {}).filter(row => row.record?.id === entry?.reviewDraft?.id);
  return matches.length === 1 ? matches[0] : null;
}

export async function recomputeSourceEntry({ entry, reportText, sourceRoot, proposalManifest, proposalBytes, editorialBytes }) {
  if (!entry?.sourceSectionTitle) return { errors: ['scan entry has no exact source section title'] };
  const sectionResult = getSectionByTitle(reportText, entry.sourceSectionTitle);
  if (sectionResult.count !== 1) return { errors: ['source section mapping is missing or ambiguous'] };
  const { body, sectionSha256 } = sectionResult;
  if (sectionSha256 !== entry.sectionSha256) return { errors: ['current report section hash differs from the scan entry'] };

  let declaredRefs;
  let expectedEvidenceDigest;
  let expectedDraft = null;
  if (entry.scanId.startsWith('editorial-')) {
    const proposal = findEditorialProposal(entry, proposalManifest);
    if (!proposal) return { errors: ['editorial scan entry has no unique source proposal'] };
    if (proposal.story.reportSectionIncludes == null || !entry.reviewDraft || entry.reviewDraft.id !== proposal.record.id || entry.reviewDraft.collection !== proposal.record.collection) return { errors: ['editorial scan entry identity or public type differs from its proposal'] };
    const proposalSections = extractReportSections(reportText).filter(section => section.title.toLowerCase().includes(proposal.story.reportSectionIncludes.toLowerCase()));
    if (proposalSections.length !== 1 || proposalSections[0].title !== entry.sourceSectionTitle) return { errors: ['editorial proposal does not bind exactly one current source section'] };
    declaredRefs = [...new Set((proposal.story.evidenceRefs || []).length ? proposal.story.evidenceRefs : sourceLinks(body))];
    expectedDraft = proposal.record;
    const proposalDigest = sha256(Buffer.concat([Buffer.from(proposalBytes), Buffer.from(editorialBytes)]));
    const refs = await resolveEvidenceReferences(declaredRefs, sourceRoot);
    expectedEvidenceDigest = sha256(JSON.stringify({ proposalDigest, record: proposal.record, refs: referenceTuples(refs) }));
    if (stableStringify(entry.reviewDraft) !== stableStringify(proposal.record)) return { errors: ['editorial scan draft differs from its source proposal'] };
  } else if (entry.scanId.startsWith('curated-')) {
    return { errors: ['curated proposal entries require a separately qualified source adapter'] };
  } else {
    declaredRefs = sourceLinks(body);
    const refs = await resolveEvidenceReferences(declaredRefs, sourceRoot);
    expectedEvidenceDigest = sha256(JSON.stringify(referenceTuples(refs)));
  }

  const references = await resolveEvidenceReferences(declaredRefs, sourceRoot);
  const errors = [];
  if (references.some(ref => !ref.exists || ref.type !== 'file' || !isSha(ref.sha256))) errors.push('one or more declared evidence references are unresolved or lack an exact file hash');
  if (stableStringify(references) !== stableStringify(entry.references)) errors.push('scan evidence references differ from current source files');
  if (expectedEvidenceDigest !== entry.evidenceDigest) errors.push('evidence digest does not match current declared evidence');
  if (entry.approvalBlockedReason) errors.push('scan entry is explicitly blocked: ' + entry.approvalBlockedReason);
  return { errors, sectionSha256, references, evidenceDigest: expectedEvidenceDigest, expectedDraft };
}

export async function validateApprovalSet({ records, approval, scan, reportText, sourceRoot, decisionEvents, proposalManifest, proposalBytes, editorialBytes }) {
  const errors = [];
  const identity = reportIdentity(reportText || '');
  if (approval?.schemaVersion !== 3) errors.push('legacy approval receipts are historical only; current-source owner reauthorization is required');
  if (approval?.status !== 'approved') errors.push('approval manifest is not active for the current source identity');
  if (!Array.isArray(records) || !Array.isArray(approval?.records) || !Array.isArray(approval?.recordIds)) errors.push('records and per-record approvals must be arrays');
  const recordIds = (records || []).map(row => row?.id);
  if (new Set(recordIds).size !== recordIds.length) errors.push('review queue contains duplicate stable public IDs');
  if (Array.isArray(records) && Array.isArray(approval?.recordIds) && stableStringify([...recordIds].sort()) !== stableStringify([...approval.recordIds].sort())) errors.push('approved IDs do not exactly match staged records');
  if (!isSha(identity.reportSha256) || !isSha(identity.sourceFingerprint)) errors.push('current report SHA-256 or source fingerprint is unavailable');
  if (approval?.sourceReportSha256 !== identity.reportSha256) errors.push('global approval report SHA-256 does not match the current report');
  if (approval?.sourceFingerprint !== identity.sourceFingerprint) errors.push('global approval source fingerprint does not match the current report');
  if (scan?.source?.reportSha256 !== identity.reportSha256 || scan?.source?.sourceFingerprint !== identity.sourceFingerprint) errors.push('private scan is stale against the canonical report');

  const historyErrors = validateDecisionEventLog(decisionEvents || []);
  errors.push(...historyErrors.map(error => 'decision history: ' + error));
  const head = decisionEvents?.at(-1) || null;
  if (approval?.decisionHistory?.chainVerified !== true || approval?.decisionHistory?.eventCount !== (decisionEvents || []).length || approval?.decisionHistory?.lastEventId !== (head?.eventId || null) || approval?.decisionHistory?.headHashSha256 !== (head?.eventHashSha256 || null)) errors.push('approval manifest does not match the verified decision-history head');
  const latestByRecord = new Map();
  for (const event of decisionEvents || []) latestByRecord.set(event.recordId, event);

  const receiptsById = new Map();
  for (const receipt of approval?.records || []) {
    if (receiptsById.has(receipt.recordId)) errors.push('record ' + receipt.recordId + ' has duplicate current approval receipts');
    receiptsById.set(receipt.recordId, receipt);
  }
  if (Array.isArray(records) && Array.isArray(approval?.records) && approval.records.length !== records.length) errors.push('current approval receipt count does not match staged record count');
  const entries = scan?.entries || [];

  for (const record of records || []) {
    const receipt = receiptsById.get(record.id);
    if (!receipt || !['approved','approved-edited'].includes(receipt.decision)) { errors.push('record ' + record.id + ' has no current explicit owner approval'); continue; }
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(record.id || '')) errors.push('record ' + record.id + ' has an invalid stable public ID');
    if (!collections.has(record.collection) || receipt.collection !== record.collection) errors.push('record ' + record.id + ' stable public type is missing or changed');
    if (receipt.recordId !== record.id) errors.push('record ' + record.id + ' approval receipt stable ID differs');
    if (receipt.sourceReportSha256 !== identity.reportSha256) errors.push('record ' + record.id + ' receipt report SHA-256 is stale');
    if (receipt.sourceFingerprint !== identity.sourceFingerprint) errors.push('record ' + record.id + ' receipt source fingerprint is stale');
    if (!isSha(receipt.sectionSha256) || !isSha(receipt.evidenceDigest) || !isSha(receipt.approvedContentSha256)) errors.push('record ' + record.id + ' receipt lacks exact source/content hashes');
    const matches = entries.filter(entry => entry.scanId === receipt.scanId);
    if (matches.length !== 1) { errors.push('record ' + record.id + ' scan entry is missing or ambiguous'); continue; }
    const entry = matches[0];
    if (receipt.scanId !== entry.scanId) errors.push('record ' + record.id + ' scan identity differs');
    if (receipt.sectionSha256 !== entry.sectionSha256 || receipt.evidenceDigest !== entry.evidenceDigest) errors.push('record ' + record.id + ' source section or linked evidence changed since review');
    if (entry.reviewDraft?.id && entry.reviewDraft.id !== record.id) errors.push('record ' + record.id + ' scan entry binds a different stable public ID');
    if (entry.reviewDraft?.collection && entry.reviewDraft.collection !== record.collection) errors.push('record ' + record.id + ' scan entry binds a different public type');
    if (entry.references?.some(ref => !ref.exists)) errors.push('record ' + record.id + ' has unresolved source/reference dependencies');
    if (stableStringify(receipt.evidenceReferences || []) !== stableStringify(entry.references || [])) errors.push('record ' + record.id + ' receipt evidence references differ from the current scan entry');
    if (!sourceRoot) errors.push('record ' + record.id + ' cannot be independently checked without the report source root');
    else {
      const sourceCheck = await recomputeSourceEntry({ entry, reportText, sourceRoot, proposalManifest, proposalBytes, editorialBytes });
      errors.push(...sourceCheck.errors.map(error => 'record ' + record.id + ': ' + error));
    }
    const content = { ...record, publishedAt: null };
    const contentHash = hashPublicContent(content);
    if (receipt.approvedContentSha256 !== contentHash) errors.push('record ' + record.id + ' public content changed since approval');
    const event = (decisionEvents || []).find(item => item.eventId === receipt.decisionEventId);
    const latest = latestByRecord.get(record.id);
    if (!event || event !== latest || event.legacyClassification) errors.push('record ' + record.id + ' current authorization event is missing, legacy, or superseded');
    if (event) {
      if (event.recordId !== record.id || event.scanId !== receipt.scanId || event.sourceReportSha256 !== identity.reportSha256 || event.sourceFingerprint !== identity.sourceFingerprint || event.sectionSha256 !== receipt.sectionSha256 || event.evidenceDigest !== receipt.evidenceDigest || event.approvedContentSha256 !== contentHash || event.collection !== record.collection || event.decision !== receipt.decision) errors.push('record ' + record.id + ' authorization event does not bind the exact approved record identity');
      const individuallyAuthorized = event.explicitCurrentSourceAuthorization === true && event.authorization?.method === 'local-cli-exact-identity-confirmation' && event.authorization?.phraseMatched === true && event.authorization?.acceptedPhrase === authorizationPhrase({ recordId: record.id, sourceReportSha256: identity.reportSha256, approvedContentSha256: contentHash });
      const batchAuthorized = event.explicitCurrentSourceAuthorization === true && batchAuthorizationMatches(event, decisionEvents, record, contentHash);
      if (!individuallyAuthorized && !batchAuthorized) errors.push('record ' + record.id + ' lacks explicit current-source owner confirmation');
    }
  }
  return [...new Set(errors)];
}
