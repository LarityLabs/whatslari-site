import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = path.resolve(process.env.LARI_SITE_ROOT || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'));
const reportPath = process.env.LARI_REPORT_PATH;
if (!reportPath) throw new Error('Set LARI_REPORT_PATH to the designated local source report; private source paths are not embedded in this public repository.');
const privateDir = path.resolve(process.env.LARI_PRIVATE_REVIEW_DIR || path.join(root, 'private-review'));
const outputPath = path.resolve(process.env.LARI_SCAN_OUTPUT_PATH || path.join(privateDir, 'research-scan.json'));
if (!outputPath.startsWith(`${privateDir}${path.sep}`)) throw new Error('Scan output must stay inside the ignored private-review directory.');
const report = await fs.readFile(reportPath, 'utf8');
const reportSha256 = crypto.createHash('sha256').update(report).digest('hex');
const fingerprint = report.match(/Source fingerprint:\s*`?([a-f0-9]{64})/i)?.[1] || null;
const generatedAt = report.match(/Generated:\s*`?([^\r\n`]+)/i)?.[1]?.trim() || null;
const headings = [...report.matchAll(/^(#{2,4})\s+(.+)$/gm)];
const meaningful = /experiment|candidate|qualification|induction|transfer|persistence|promotion|rollback|learning|research|coding|capability|architecture|verification|failure|blocked|benchmark|runtime|composition|language|active|evaluation|what lari is/i;
const sections = headings.map((match, index) => ({ title: match[2].trim(), start: match.index + match[0].length, end: headings[index + 1]?.index ?? report.length }));
const existing = JSON.parse(await fs.readFile(outputPath, 'utf8').catch(() => '{"entries":[]}'));
const approved = JSON.parse(await fs.readFile(path.join(root, 'data/approved/snapshot.json'), 'utf8'));
const approvedIds = new Set(['experiments','capabilities','milestones','metrics'].flatMap(key => approved[key] || []).map(row => row.id));
const approvedTitles = new Set(['experiments','capabilities','milestones','metrics'].flatMap(key => approved[key] || []).map(row => row.title.toLowerCase().replace(/[^a-z0-9]+/g,' ').trim()));
const normalized = new Map();
const entries = [];
for (const section of sections) {
  if (!meaningful.test(section.title)) continue;
  const body = report.slice(section.start, section.end).trim();
  if (body.length < 80) continue;
  const date = section.title.match(/\b20\d{2}-\d{2}-\d{2}(?:T[\d:.+-]+Z?)?/i)?.[0] || null;
  const refs = [...new Set([...body.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)].map(match => match[1]).filter(ref => !/^https?:/i.test(ref)))];
  const resolutions = [];
  for (const ref of refs) {
    const cleaned = decodeURIComponent(ref.split('#')[0]).replaceAll('/', path.sep);
    const resolved = path.resolve(path.dirname(reportPath), cleaned);
    const relative = path.relative(path.dirname(reportPath), resolved);
    if (relative.startsWith('..') || path.isAbsolute(relative)) { resolutions.push({ ref, exists: false, reason: 'reference escapes designated source root' }); continue; }
    try {
      const stat = await fs.stat(resolved);
      const isFile = stat.isFile();
      const isDirectory = stat.isDirectory();
      const bytes = isFile ? await fs.readFile(resolved) : null;
      resolutions.push({ ref, exists: isFile || isDirectory, type: isFile ? 'file' : isDirectory ? 'directory' : 'unsupported', bytes: isFile ? stat.size : null, sha256: isFile ? crypto.createHash('sha256').update(bytes).digest('hex') : null, reason: isDirectory ? 'directory reference resolved; directory contents are not indexed' : null });
    } catch { resolutions.push({ ref, exists: false, reason: 'not found at scan time' }); }
  }
  const key = `${date || ''}|${section.title.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()}`;
  const id = `scan-${crypto.createHash('sha256').update(key).digest('hex').slice(0, 12)}`;
  if (normalized.has(key)) { normalized.get(key).duplicateSectionIds.push(id); continue; }
  const excerpt = body.slice(0, 5000);
  const reportStatus = /\bnot active\b|\bunpromoted\b|\bcandidate only\b/i.test(body) ? 'candidate/unpromoted (report-derived)' : /\bstale\b|\bhistorical\b/i.test(body) ? 'historical or stale (report-derived)' : /\bfailed\b|\bfailure\b|\bno candidate\b|\bnot ready\b/i.test(body) ? 'negative or blocked (report-derived)' : /\bactive\b|\bproduction\b/i.test(body) ? 'active claim present (report-derived; artifact review required)' : 'unknown (report-derived)';
  const sectionSha256 = crypto.createHash('sha256').update(body).digest('hex');
  const evidenceDigest = crypto.createHash('sha256').update(JSON.stringify(resolutions.map(ref => [ref.ref,ref.exists,ref.sha256 || null,ref.reason || null]).sort((a,b) => a[0].localeCompare(b[0])))).digest('hex');
  const priorEntry = existing.entries?.find(row => row.scanId === id);
  const approvedDuplicate = approvedIds.has(id) || approvedTitles.has(section.title.toLowerCase().replace(/[^a-z0-9]+/g,' ').trim());
  const entry = { scanId: id, title: section.title, date, reportStatus, statusChangedSinceLastScan:priorEntry ? priorEntry.reportStatus !== reportStatus : false, reportEvidenceClass: 'report-derived; not yet independently artifact-verified', referenceCount: refs.length, references: resolutions, approvedDuplicate, duplicateSectionIds: [], sectionSha256, evidenceDigest, changeStatus: priorEntry ? priorEntry.sectionSha256 === sectionSha256 && priorEntry.evidenceDigest === evidenceDigest ? 'unchanged since last scan' : 'source text or linked evidence changed since last scan' : 'newly discovered section', excerpt, disposition: priorEntry?.sectionSha256 === sectionSha256 && priorEntry.evidenceDigest === evidenceDigest ? priorEntry.disposition : 'new-for-review' };
  entry.sourceSectionTitle = section.title;
  normalized.set(key, entry); entries.push(entry);
}

let curatedProposal = { status: 'not-found' };
try {
  const proposalPath = path.join(root, 'private-review/candidate-records.json');
  const proposalText = await fs.readFile(proposalPath,'utf8');
  const proposal = JSON.parse(proposalText);
  const sourceRoot = path.dirname(reportPath);
  const sourcePath = path.resolve(proposal.source.path);
  const relative = path.relative(sourceRoot,sourcePath);
  if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('proposed source escapes the owner-designated source root');
  const sourceBytes = await fs.readFile(sourcePath);
  const sourceSha256 = crypto.createHash('sha256').update(sourceBytes).digest('hex');
  const sourceMatches = sourceSha256 === proposal.source.sha256;
  const record = proposal.records?.[0];
  const evidenceRef = 'consolidation/research-retention-persistent-worker-20261031/isolated-research-retention-18672-1793440818773/evidence.json';
  const reportEntry = entries.find(item => item.references.some(ref => ref.ref.replaceAll('\\','/').includes(evidenceRef)));
  const evidencePath = path.resolve(sourceRoot,evidenceRef);
  const evidenceBytes = await fs.readFile(evidencePath).catch(() => null);
  const refs = [{ ref:relative.replaceAll('\\','/'), exists:true, bytes:sourceBytes.length, sha256:sourceSha256, sourceKind:'owner proposal source' },{ ref:evidenceRef, exists:!!evidenceBytes, bytes:evidenceBytes?.length || null, sha256:evidenceBytes ? crypto.createHash('sha256').update(evidenceBytes).digest('hex') : null, reason:evidenceBytes ? null : 'not found at scan time' }];
  const sectionSha256 = reportEntry?.sectionSha256 || crypto.createHash('sha256').update('canonical report section missing').digest('hex');
  const evidenceDigest = crypto.createHash('sha256').update(JSON.stringify([proposalText, ...refs.map(ref => [ref.ref,ref.exists,ref.sha256 || null])])).digest('hex');
  const scanId = `curated-${crypto.createHash('sha256').update(record.id).digest('hex').slice(0,12)}`;
  const priorEntry = existing.entries?.find(item => item.scanId === scanId);
  const measuredAt = /^\d{4}-\d\d-\d\d/.test(record.measuredAt || '') ? record.measuredAt : null;
  const reviewDraft = {
    id:record.id, collection:'experiments', title:record.title, summary:record.summary, status:record.status, verificationStatus:record.verificationStatus,
    lifecycleStatus:'candidate', sourceRecordId:record.sourceRecordId, measuredAt, evaluationMethod:record.evaluationMethod,
    reportVersion:`LARI Full Report ${generatedAt || 'date unknown'}`, limitations:record.limitations, result:record.result, environment:record.environment,
    measurements:record.measurements || {}, measurementConditions:'Fixture-backed single-worker test; measurement values are counts or booleans, not a general benchmark.',
    researchQuestion:'Does eligible user-scoped research knowledge persist across worker restart and remain reversible?', researchArea:'Persistence and learning', architectureComponent:'persistence',
    whyItMatters:'The test probes whether one eligible record remains available after restart without altering the base model.',
    candidateMethod:'', baseline:'', comparisonConditions:'Two supplied fixtures; one new example; a second user scope; explicit rollback.', outcome:'Narrow fixture-backed persistence proof.',
    externalModelUsage:'Zero external-model calls in the cited test.', coldReloadResult:'Exact record reloaded in a fresh worker and selected for one new example.',
    causalAblationResult:null, transferResult:'One new negative-division example; not a broad transfer test.', relatedExperimentIds:[], relationships:[], publicProvenance:'Owner-reviewed summary of a dated LARI persistent-worker test; no public artifact URL is available.'
  };
  const contentHash = crypto.createHash('sha256').update(JSON.stringify(reviewDraft)).digest('hex');
  const approvalBlockedReason = !sourceMatches ? 'Proposed source artifact hash does not match the candidate manifest.' : !reportEntry ? 'The proposal has no matching section/reference in the canonical Full Report.' : !evidenceBytes ? 'The primary verification artifact cannot be resolved.' : null;
  const candidateEntry = { scanId, title:record.title, date:measuredAt, reportStatus:'candidate/unpromoted (owner-proposed; public review still required)', reportEvidenceClass: reportEntry ? 'canonical-report-linked; primary artifact resolved; artifact contents inspected in this review' : 'owner proposal; canonical report section link missing', referenceCount:refs.length, references:refs, approvedDuplicate:approvedTitles.has(record.title.toLowerCase().replace(/[^a-z0-9]+/g,' ').trim()), duplicateSectionIds:[], sectionSha256, evidenceDigest, proposalContentSha256:contentHash, changeStatus:priorEntry ? priorEntry.evidenceDigest === evidenceDigest && priorEntry.sectionSha256 === sectionSha256 ? 'unchanged since last scan' : 'proposal or linked evidence changed since last scan' : 'existing owner proposal newly indexed', excerpt:`PROPOSED PUBLIC WORDING\n${record.title}\n${record.summary}\n\nResult: ${record.result}\nLimitations: ${record.limitations}\n\nThis is a proposed record. No publication approval has been granted.`, reviewDraft, disposition:priorEntry?.evidenceDigest === evidenceDigest && priorEntry?.sectionSha256 === sectionSha256 ? priorEntry.disposition : 'new-for-review', sourceMatches, approvalBlockedReason };
  entries.unshift(candidateEntry);
  curatedProposal = { status: sourceMatches && !!reportEntry && !!evidenceBytes ? 'source-and-canonical-evidence-resolved' : 'needs-source-reconciliation', sourceMatches, reportSectionLinked:!!reportEntry, primaryArtifactResolved:!!evidenceBytes, proposalContentSha256:contentHash };
} catch (error) { curatedProposal = { status:'unavailable-or-unresolved', reason:error.message }; }
let editorialRelease = { status: 'not-found', records: 0 };
try {
  const proposalPath = path.join(privateDir, 'launch-proposals.json');
  const proposalBytes = await fs.readFile(proposalPath);
  const proposalManifest = JSON.parse(proposalBytes.toString('utf8'));
  if (proposalManifest.sourceFingerprint && proposalManifest.sourceFingerprint !== fingerprint) {
    editorialRelease = { status: 'source-fingerprint-mismatch', records: 0, expectedSourceFingerprint: proposalManifest.sourceFingerprint, actualSourceFingerprint: fingerprint };
  } else {
  const editorialPath = path.join(privateDir, proposalManifest.editorialFile || 'LARI_LIVE_LAUNCH_REVIEW.md');
  const editorialRelative = path.relative(privateDir, editorialPath);
  if (editorialRelative.startsWith('..') || path.isAbsolute(editorialRelative)) throw new Error('editorial source must stay inside private-review');
  const editorialBytes = await fs.readFile(editorialPath);
  const proposalDigest = crypto.createHash('sha256').update(Buffer.concat([proposalBytes, editorialBytes])).digest('hex');
  const generated = [];
  const editorialRecords = [];
  for (const story of proposalManifest.records || []) {
    editorialRecords.push({ ...story, publicationKind: 'experiment' });
    if (story.capabilityDraft) editorialRecords.push({ ...story, record: story.capabilityDraft, publicationKind: 'capability' });
    if (story.milestoneDraft) editorialRecords.push({ ...story, record: story.milestoneDraft, publicationKind: 'milestone' });
  }
  for (const proposal of editorialRecords) {
    const record = proposal.record;
    if (!record?.id || !proposal.reportSectionIncludes || !Array.isArray(proposal.evidenceRefs)) throw new Error('each editorial proposal requires a record, reportSectionIncludes, and evidenceRefs');
    const matches = sections.filter(section => section.title.toLowerCase().includes(proposal.reportSectionIncludes.toLowerCase()));
    const section = matches.length === 1 ? matches[0] : null;
    const body = section ? report.slice(section.start, section.end).trim() : '';
    const sectionSha256 = section ? crypto.createHash('sha256').update(body).digest('hex') : crypto.createHash('sha256').update('canonical report section missing or ambiguous').digest('hex');
    const refs = [];
    const sectionRefs = section ? [...new Set([...body.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)].map(match => match[1]).filter(ref => !/^https?:/i.test(ref)))] : [];
    // Editorial proposals name the exact private evidence reviewed for that
    // public claim. The canonical section hash binds its wording, while
    // evidenceRefs avoids inheriting unrelated or broken links from a long
    // report section.
    const listedRefs = [...new Set(proposal.evidenceRefs.length ? proposal.evidenceRefs : sectionRefs)];
    for (const ref of listedRefs) {
      const cleaned = decodeURIComponent(ref.split('#')[0]).replaceAll('/', path.sep);
      const resolved = path.resolve(path.dirname(reportPath), cleaned);
      const relative = path.relative(path.dirname(reportPath), resolved);
      if (relative.startsWith('..') || path.isAbsolute(relative)) { refs.push({ ref, exists: false, reason: 'reference escapes designated source root' }); continue; }
      try {
        const stat = await fs.stat(resolved);
        const isFile = stat.isFile(), isDirectory = stat.isDirectory();
        const bytes = isFile ? await fs.readFile(resolved) : null;
        refs.push({ ref, exists: isFile || isDirectory, type: isFile ? 'file' : isDirectory ? 'directory' : 'unsupported', bytes: isFile ? stat.size : null, sha256: isFile ? crypto.createHash('sha256').update(bytes).digest('hex') : null, reason: isDirectory ? 'directory reference resolved; directory contents are not indexed' : null });
      } catch { refs.push({ ref, exists: false, reason: 'not found at scan time' }); }
    }
    const evidenceDigest = crypto.createHash('sha256').update(JSON.stringify({ proposalDigest, record, refs: refs.map(ref => [ref.ref,ref.exists,ref.sha256 || null,ref.reason || null]).sort((a,b) => a[0].localeCompare(b[0])) })).digest('hex');
    const blocked = matches.length !== 1 ? `Expected one canonical report section; found ${matches.length}.` : refs.some(ref => !ref.exists) ? 'One or more linked verification sources could not be resolved.' : null;
    generated.push({
      scanId: `editorial-${record.id}`, title: record.title, date: record.measuredAt || null,
      reportStatus: proposal.reportStatus || `${record.status} (editorial candidate; owner review required)`,
      statusChangedSinceLastScan: false, reportEvidenceClass: blocked ? 'editorial proposal with unresolved source evidence' : proposal.evidenceClass || 'editorial proposal linked to canonical report and resolved private evidence',
      referenceCount: refs.length, references: refs, approvedDuplicate: approvedIds.has(record.id) || approvedTitles.has(record.title.toLowerCase().replace(/[^a-z0-9]+/g,' ').trim()),
      duplicateSectionIds: [], sectionSha256, evidenceDigest,
      proposalContentSha256: crypto.createHash('sha256').update(JSON.stringify(record)).digest('hex'),
      changeStatus: 'owner editorial selection; record-level publication review required', excerpt: proposal.reviewExcerpt || `PROPOSED PUBLIC RECORD\n${record.title}\n${record.summary}`,
      reviewDraft: record, disposition: existing.entries?.find(item => item.scanId === `editorial-${record.id}` && item.evidenceDigest === evidenceDigest && item.sectionSha256 === sectionSha256)?.disposition || 'new-for-review',
      approvalBlockedReason: blocked, editorialAuthorization: proposalManifest.authorization || null
    });
  }
  entries.unshift(...generated);
  for (const entry of generated) {
    const proposal = editorialRecords.find(item => 'editorial-' + item.record.id === entry.scanId);
    const matches = proposal ? sections.filter(section => section.title.toLowerCase().includes(proposal.reportSectionIncludes.toLowerCase())) : [];
    entry.sourceSectionTitle = matches.length === 1 ? matches[0].title : null;
  }
  editorialRelease = { status: generated.length === editorialRecords.length && generated.every(item => !item.approvalBlockedReason) ? 'all-sources-resolved' : 'needs-review-or-source-reconciliation', records: generated.length, selectedStories: (proposalManifest.records || []).length, proposalDigest };
  }
} catch (error) { editorialRelease = { status: 'unavailable-or-unresolved', records: 0, reason: error.message }; }
const result = { schemaVersion: 1, status: 'private-review-only', scannedAt: new Date().toISOString(), source: { path: reportPath, generatedAt, sourceFingerprint: fingerprint, reportSha256 }, headingsScanned: headings.length, meaningfulSectionsScanned: entries.length, duplicatesDetected: entries.reduce((sum, row) => sum + row.duplicateSectionIds.length, 0), curatedProposal, editorialRelease, unresolvedReferences: entries.flatMap(row => row.references.filter(ref => !ref.exists).map(ref => ({ scanId: row.scanId, ref: ref.ref, reason: ref.reason }))), entries };
await fs.mkdir(path.dirname(outputPath), { recursive: true });
await fs.writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`);
const ledgerPath = path.join(privateDir, 'research-ledger.jsonl');
const ledger = (await fs.readFile(ledgerPath, 'utf8').catch(() => '')).split(/\r?\n/).filter(Boolean).map(line => { try { return JSON.parse(line); } catch { return null; } }).filter(Boolean);
const seen = new Set(ledger.map(item => `${item.scanId}|${item.sectionSha256}|${item.evidenceDigest}`));
const additions = [];
for (const entry of entries) {
  const key = `${entry.scanId}|${entry.sectionSha256}|${entry.evidenceDigest}`;
  if (seen.has(key)) continue;
  additions.push({ schemaVersion: 1, kind: 'private-research-record', recordedAt: result.scannedAt, scanId: entry.scanId, title: entry.title, date: entry.date, sourceReportGeneratedAt: result.source.generatedAt, sourceReportSha256: result.source.reportSha256, sourceFingerprint: result.source.sourceFingerprint, reportStatus: entry.reportStatus, reportEvidenceClass: entry.reportEvidenceClass, sectionSha256: entry.sectionSha256, evidenceDigest: entry.evidenceDigest, referenceCount: entry.referenceCount, references: entry.references, reportExcerpt: entry.excerpt, publicationStatus: 'candidate-only; owner review required' });
  seen.add(key);
}
if (additions.length) await fs.appendFile(ledgerPath, `${additions.map(row => JSON.stringify(row)).join('\n')}\n`, 'utf8');
if (process.env.LARI_SKIP_DRAFT_GENERATION !== '1') await import('./generate-paper-candidates.mjs');
process.stdout.write(`Private scan complete: ${headings.length} headings; ${entries.length} substantive sections; ${result.duplicatesDetected} duplicate sections; ${result.unresolvedReferences.length} unresolved local references.\nReport fingerprint: ${fingerprint || 'not present'}\nReport SHA-256: ${reportSha256}\nCandidates remain private and unapproved: ${outputPath}\n`);
