import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { hashDecisionEvent, hashPublicContent, sha256, stableStringify } from './publication-crypto.mjs';

const isSha = value => typeof value === 'string' && /^[a-f0-9]{64}$/i.test(value);

function parseAuthorizedBatchEvent(event) {
  if (event?.eventType !== 'owner-batch-authorization' || event.decision !== 'batch-authorized') return null;
  const auth = event.authorization || {};
  if (auth.method !== 'owner-authorized-batch-manifest' || auth.channel !== 'interactive-console' || auth.phraseMatched !== true) return null;
  if (typeof auth.manifestRaw !== 'string' || !isSha(auth.manifestFileSha256)) return null;
  if (sha256(auth.manifestRaw) !== auth.manifestFileSha256) return null;
  let manifest;
  try { manifest = JSON.parse(auth.manifestRaw); } catch { return null; }
  const { manifestSha256, ...payload } = manifest || {};
  if (!isSha(manifestSha256) || sha256(stableStringify(payload)) !== manifestSha256) return null;
  if (!isSha(manifest.source?.reportSha256) || !isSha(manifest.source?.sourceFingerprint) || !isSha(auth.manifestFileSha256)) return null;
  const expected = 'AUTHORIZE BATCH ' + auth.manifestFileSha256;
  if (auth.expectedPhrase !== expected || auth.acceptedPhrase !== expected) return null;
  if (manifest.status !== 'prepared-not-authorized' || manifest.kind !== 'lari-current-source-owner-publication-batch-review') return null;
  if (!Array.isArray(manifest.records) || !Array.isArray(manifest.scope?.includedRecordIds)) return null;
  if (JSON.stringify(manifest.scope.includedRecordIds) !== JSON.stringify(manifest.records.filter(row => row.classification === 'PASS').map(row => row.recordId))) return null;
  if (manifest.records.some(row => ['REVISE','HOLD'].includes(row.classification) && manifest.scope.includedRecordIds.includes(row.recordId))) return null;
  if (new Set(manifest.records.map(row => row.recordId)).size !== manifest.records.length) return null;
  const noAuthToken = value => {
    if (typeof value === 'string') {
      return !/\bAUTHORIZE BATCH [a-f0-9]{64}\b/i.test(value)
        && !/\bAUTHORIZE [a-z0-9-]+ REPORT [a-f0-9]{64} CONTENT [a-f0-9]{64}\b/i.test(value);
    }
    if (!value || typeof value !== 'object') return true;
    return Object.entries(value).every(([key, child]) => !/^(authorizationPhrase|acceptedPhrase|ownerConfirmation|authorizationToken)$/i.test(key) && noAuthToken(child));
  };
  if (!noAuthToken(manifest)) return null;
  return { manifest, manifestFileSha256: auth.manifestFileSha256, expectedPhrase: expected };
}

function batchRecordForEvent(batch, event) {
  const row = batch?.manifest?.records?.find(item => item.recordId === event.recordId);
  if (!row || row.classification !== 'PASS') return false;
  return row.scanId === event.scanId
    && row.collection === event.collection
    && row.currentPublicContentSha256 === event.approvedContentSha256
    && row.currentSourceSectionSha256 === event.sectionSha256
    && row.evidenceDigest === event.evidenceDigest
    && batch.manifest.source?.reportSha256 === event.sourceReportSha256
    && batch.manifest.source?.sourceFingerprint === event.sourceFingerprint
    && stableStringify(row.evidenceReferences) === stableStringify(event.evidenceReferences || []);
}

function batchDigests(manifest) {
  const pass = manifest.records.filter(row => row.classification === 'PASS');
  return {
    sectionSha256: sha256(stableStringify(pass.map(row => ({ recordId: row.recordId, sectionSha256: row.currentSourceSectionSha256, evidenceDigest: row.evidenceDigest })))),
    evidenceDigest: sha256(stableStringify(pass.map(row => ({ recordId: row.recordId, evidenceReferences: row.evidenceReferences }))))
  };
}

export function authorizationPhrase({ recordId, sourceReportSha256, approvedContentSha256 }) {
  return 'AUTHORIZE ' + recordId + ' REPORT ' + sourceReportSha256 + ' CONTENT ' + approvedContentSha256;
}

export function validateDecisionEventLog(events) {
  const errors = [];
  if (!Array.isArray(events)) return ['decision event history is not an array'];
  let prior = null;
  const ids = new Set();
  const lastByRecord = new Map();
  events.forEach((event, index) => {
    const label = 'event sequence ' + (index + 1);
    if (!event || event.eventVersion !== 1) errors.push(label + ' has an unsupported event version');
    if (event.sequence !== index + 1) errors.push(label + ' has a discontinuous sequence number');
    if (!event.eventId || ids.has(event.eventId)) errors.push(label + ' has a missing or duplicate event ID');
    ids.add(event.eventId);
    if ((event.previousEventId || null) !== (prior?.eventId || null)) errors.push(label + ' does not reference the previous event');
    if ((event.previousEventHashSha256 || null) !== (prior?.eventHashSha256 || null)) errors.push(label + ' has an invalid previous event hash');
    const previousRecord = lastByRecord.get(event.recordId) || null;
    if ((event.previousRecordEventId || null) !== (previousRecord?.eventId || null)) errors.push(label + ' has an invalid prior-record event reference');
    if (!event.eventHashSha256 || event.eventHashSha256 !== hashDecisionEvent(event)) errors.push(label + ' hash does not match its event content');
    if (!event.recordId || !event.scanId) errors.push(label + ' lacks a stable record or scan ID');
    if (!event.decision || !event.decisionTimestamp || !Number.isFinite(Date.parse(event.decisionTimestamp))) errors.push(label + ' lacks a decision or valid timestamp');
    if (!event.reviewer) errors.push(label + ' lacks reviewer identity');
    if (event.legacyClassification) {
      if (event.explicitCurrentSourceAuthorization !== false) errors.push(label + ' legacy event is incorrectly marked as current authorization');
    } else if (event.eventType === 'owner-batch-authorization') {
      const batch = parseAuthorizedBatchEvent(event);
      if (!batch) errors.push(label + ' owner batch authorization is malformed or not bound to an exact typed manifest phrase');
      else {
        const digests = batchDigests(batch.manifest);
        if (event.explicitCurrentSourceAuthorization !== true || event.approvedContentSha256 !== batch.manifestFileSha256 || event.sourceReportSha256 !== batch.manifest.source?.reportSha256 || event.sourceFingerprint !== batch.manifest.source?.sourceFingerprint || event.sectionSha256 !== digests.sectionSha256 || event.evidenceDigest !== digests.evidenceDigest || event.collection !== 'batch') errors.push(label + ' batch event does not bind the exact manifest and source identities');
      }
    } else {
      if (!isSha(event.sourceReportSha256) || !isSha(event.sourceFingerprint) || !isSha(event.sectionSha256) || !isSha(event.evidenceDigest)) errors.push(label + ' lacks exact current source hashes');
      if (event.decision === 'approved' || event.decision === 'approved-edited') {
        if (!isSha(event.approvedContentSha256)) errors.push(label + ' lacks the exact approved-content hash');
        if (event.authorization?.method === 'local-cli-exact-identity-confirmation') {
          const expected = authorizationPhrase(event);
          if (event.explicitCurrentSourceAuthorization !== true || event.authorization?.phraseMatched !== true || event.authorization?.expectedPhrase !== expected || event.authorization?.acceptedPhrase !== expected) errors.push(label + ' lacks explicit authorization bound to its report and content hashes');
        } else if (event.authorization?.method === 'owner-authorized-batch-record') {
          const batchEvent = events.slice(0, index).find(candidate => candidate.eventId === event.authorization?.batchAuthorizationEventId);
          const batch = parseAuthorizedBatchEvent(batchEvent);
          if (event.explicitCurrentSourceAuthorization !== true || !batch || event.authorization?.phraseMatched !== true || event.authorization?.batchManifestFileSha256 !== batch.manifestFileSha256 || event.authorization?.expectedPhrase !== batch.expectedPhrase || event.authorization?.acceptedPhrase !== batch.expectedPhrase || event.reviewer !== batchEvent.reviewer || !batchRecordForEvent(batch, event)) errors.push(label + ' lacks a valid prior owner-authorized batch event for this exact record');
        } else {
          errors.push(label + ' lacks explicit individual or batch authorization bound to its report and content hashes');
        }
      }
    }
    prior = event;
    if (event.recordId) lastByRecord.set(event.recordId, event);
  });
  return errors;
}

export function createLegacyDecisionEvents({ approval, decisions, records = [], ledgerEntries = [], approvalBytes = '', decisionsBytes = '' }) {
  const recordById = new Map(records.map(record => [record.id, record]));
  const decisionsByScan = new Map((decisions?.decisions || []).map(item => [item.scanId, item]));
  const approvalByScan = new Map((approval?.records || []).map(item => [item.scanId, item]));
  const rows = [];
  for (const receipt of approval?.records || []) {
    const decision = decisionsByScan.get(receipt.scanId) || {};
    const ledger = [...ledgerEntries].reverse().find(item => item.scanId === receipt.scanId && item.sectionSha256 === receipt.sectionSha256 && item.evidenceDigest === receipt.evidenceDigest);
    rows.push({
      recordId: receipt.recordId,
      scanId: receipt.scanId,
      sourceReportSha256: receipt.sourceReportSha256 || approval.sourceReportSha256 || null,
      sourceFingerprint: receipt.sourceFingerprint || approval.sourceFingerprint || null,
      sectionSha256: receipt.sectionSha256 || decision.sectionSha256 || null,
      evidenceDigest: receipt.evidenceDigest || decision.evidenceDigest || null,
      evidenceReferences: ledger?.references || [],
      approvedContentSha256: receipt.approvedContentSha256 || decision.approvedContentSha256 || null,
      collection: recordById.get(receipt.recordId)?.collection || null,
      decision: receipt.decision || decision.disposition || 'approved',
      decisionTimestamp: receipt.reviewedAt || decision.reviewedAt || approval.approvedAt || new Date(0).toISOString(),
      reviewer: receipt.reviewer || decision.reviewer || approval.approver || 'legacy reviewer unknown',
      authorization: { kind: 'legacy-existing-authorization', text: receipt.authorization || decision.authorization || approval.authorization || null, explicitCurrentSourceAuthorization: false },
      explicitCurrentSourceAuthorization: false,
      legacyClassification: 'legacy-schema-v2-approval-not-current-source-authorization',
      legacySourceHashes: { approvalManifestSha256: sha256(approvalBytes), researchDecisionsSha256: sha256(decisionsBytes) }
    });
  }
  for (const decision of decisions?.decisions || []) {
    if (approvalByScan.has(decision.scanId)) continue;
    const ledger = [...ledgerEntries].reverse().find(item => item.scanId === decision.scanId && item.sectionSha256 === decision.sectionSha256 && item.evidenceDigest === decision.evidenceDigest);
    rows.push({
      recordId: decision.recordId || 'legacy:' + decision.scanId,
      scanId: decision.scanId,
      sourceReportSha256: decision.sourceReportSha256 || null,
      sourceFingerprint: decision.sourceFingerprint || null,
      sectionSha256: decision.sectionSha256 || null,
      evidenceDigest: decision.evidenceDigest || null,
      evidenceReferences: ledger?.references || [],
      approvedContentSha256: decision.approvedContentSha256 || null,
      collection: null,
      decision: decision.disposition || 'deferred',
      decisionTimestamp: decision.reviewedAt || new Date(0).toISOString(),
      reviewer: decision.reviewer || 'legacy reviewer unknown',
      authorization: { kind: 'legacy-decision', text: decision.authorization || null, explicitCurrentSourceAuthorization: false },
      explicitCurrentSourceAuthorization: false,
      legacyClassification: 'legacy-decision-not-current-source-authorization',
      legacySourceHashes: { approvalManifestSha256: sha256(approvalBytes), researchDecisionsSha256: sha256(decisionsBytes) }
    });
  }
  return rows;
}

function linkEvent(eventData, sequence, previous, previousRecord) {
  const event = {
    eventVersion: 1,
    sequence,
    eventId: crypto.randomUUID(),
    previousEventId: previous?.eventId || null,
    previousEventHashSha256: previous?.eventHashSha256 || null,
    previousRecordEventId: previousRecord?.eventId || null,
    ...eventData
  };
  event.eventHashSha256 = hashDecisionEvent(event);
  return event;
}

export async function readDecisionEventLog(filePath) {
  let raw;
  try { raw = await fs.readFile(filePath, 'utf8'); }
  catch (error) { if (error.code === 'ENOENT') return { exists: false, events: [], errors: [] }; throw error; }
  if (!raw) return { exists: true, events: [], errors: [] };
  if (!raw.endsWith('\n')) return { exists: true, events: [], errors: ['decision history has an incomplete final line; preserved fail-closed for manual recovery'] };
  let events;
  try { events = raw.trimEnd().split(/\r?\n/).map(line => JSON.parse(line)); }
  catch { return { exists: true, events: [], errors: ['decision history contains malformed JSON; preserved fail-closed for manual recovery'] }; }
  return { exists: true, events, errors: validateDecisionEventLog(events) };
}

export async function appendDecisionEvent({ filePath, legacyEvents = [], eventData }) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const lockPath = filePath + '.lock';
  let lock;
  try { lock = await fs.open(lockPath, 'wx'); }
  catch (error) {
    if (error.code === 'EEXIST') throw new Error('Decision history is locked by another review or an interrupted writer; inspect the lock before retrying.');
    throw error;
  }
  try {
    await lock.writeFile(JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }) + '\n', 'utf8');
    await lock.sync();
    const state = await readDecisionEventLog(filePath);
    if (state.errors.length) throw new Error('Decision history rejected: ' + state.errors.join('; '));
    let base = state.events;
    if (!state.events.length && legacyEvents.length) {
      base = [];
      for (const item of legacyEvents) {
        const prior = base.at(-1) || null;
        const previousRecord = [...base].reverse().find(row => row.recordId === item.recordId) || null;
        base.push(linkEvent(item, base.length + 1, prior, previousRecord));
      }
    }
    const previous = base.at(-1) || null;
    const previousRecord = [...base].reverse().find(row => row.recordId === eventData.recordId) || null;
    const event = linkEvent(eventData, base.length + 1, previous, previousRecord);
    const complete = [...base, event];
    const candidateErrors = validateDecisionEventLog(complete);
    if (candidateErrors.length) throw new Error('Decision event rejected before append: ' + candidateErrors.join('; '));
    if (!state.exists || !state.events.length) {
      const temp = filePath + '.' + crypto.randomUUID() + '.tmp';
      const handle = await fs.open(temp, 'wx');
      try {
        for (const row of complete) await handle.writeFile(JSON.stringify(row) + '\n', 'utf8');
        await handle.sync();
      } finally { await handle.close(); }
      await fs.rename(temp, filePath);
    } else {
      const handle = await fs.open(filePath, 'a');
      try { await handle.writeFile(JSON.stringify(event) + '\n', 'utf8'); await handle.sync(); }
      finally { await handle.close(); }
    }
    const verified = await readDecisionEventLog(filePath);
    if (verified.errors.length) throw new Error('Appended decision history failed verification: ' + verified.errors.join('; '));
    return verified.events;
  } finally {
    await lock.close();
    await fs.rm(lockPath, { force: true });
  }
}

export function latestDecisionByScan(events) {
  const map = new Map();
  for (const event of events) map.set(event.scanId, event);
  return map;
}

export function buildCurrentApprovalManifest({ events, records, reportSha256, sourceFingerprint, historyRelativePath }) {
  const latestByRecord = new Map();
  for (const event of events) latestByRecord.set(event.recordId, event);
  const receipts = [];
  for (const record of records) {
    const event = latestByRecord.get(record.id);
    const contentHash = hashPublicContent({ ...record, publishedAt: null });
    if (!event || event.legacyClassification || event.explicitCurrentSourceAuthorization !== true || !['approved','approved-edited'].includes(event.decision)) continue;
    if (event.sourceReportSha256 !== reportSha256 || event.sourceFingerprint !== sourceFingerprint || event.approvedContentSha256 !== contentHash || event.collection !== record.collection) continue;
    receipts.push({
      recordId: event.recordId, scanId: event.scanId, sectionSha256: event.sectionSha256, evidenceDigest: event.evidenceDigest,
      evidenceReferences: event.evidenceReferences, approvedContentSha256: event.approvedContentSha256, collection: event.collection,
      sourceFingerprint: event.sourceFingerprint, sourceReportSha256: event.sourceReportSha256, reviewedAt: event.decisionTimestamp,
      reviewer: event.reviewer, authorization: event.authorization, decision: event.decision, decisionEventId: event.eventId,
      previousEventId: event.previousRecordEventId
    });
  }
  const orderedEvents = events;
  const allApproved = receipts.length === records.length && records.every(record => receipts.some(receipt => receipt.recordId === record.id));
  const last = orderedEvents.at(-1) || null;
  const latestApproval = [...orderedEvents].reverse().find(event => event.explicitCurrentSourceAuthorization && ['approved','approved-edited'].includes(event.decision));
  return {
    schemaVersion: 3,
    status: allApproved ? 'approved' : 'pending-current-source-authorization',
    approver: latestApproval?.reviewer || null,
    approvedAt: allApproved ? latestApproval?.decisionTimestamp || null : null,
    sourceReportSha256: reportSha256,
    sourceFingerprint,
    recordIds: receipts.map(receipt => receipt.recordId),
    records: receipts,
    decisionHistory: { path: historyRelativePath, eventCount: events.length, lastEventId: last?.eventId || null, headHashSha256: last?.eventHashSha256 || null, chainVerified: true }
  };
}
