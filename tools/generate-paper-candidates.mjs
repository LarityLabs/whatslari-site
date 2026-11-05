import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const privateDir = path.resolve(process.env.LARI_PRIVATE_REVIEW_DIR || path.join(root, 'private-review'));
const scanPath = path.resolve(process.env.LARI_SCAN_OUTPUT_PATH || path.join(privateDir, 'research-scan.json'));
const scan = JSON.parse(await fs.readFile(scanPath, 'utf8'));
const outputDir = path.join(privateDir, 'paper-candidates');
await fs.mkdir(outputDir, { recursive: true });
const previousManifest = JSON.parse(await fs.readFile(path.join(outputDir, 'manifest.json'), 'utf8').catch(() => '{"candidates":[]}'));
const previousCandidates = new Map((previousManifest.candidates || []).map(item => [item.scanId, item]));
const unknown = 'Unknown / not stated in the source record.';
const text = value => typeof value === 'string' && value.trim() ? value.trim() : unknown;
const generated = [];
for (const entry of scan.entries || []) {
  const sourceHash = crypto.createHash('sha256').update(JSON.stringify({ scanId: entry.scanId, sectionSha256: entry.sectionSha256, evidenceDigest: entry.evidenceDigest, proposalContentSha256: entry.proposalContentSha256 || null })).digest('hex');
  const draft = entry.reviewDraft || {};
  const references = (entry.references || []).map(ref => `- ${ref.exists ? 'Resolved' : 'Unresolved'}: ${ref.ref}${ref.sha256 ? ` (private SHA-256: ${ref.sha256})` : ''}${ref.reason ? ` — ${ref.reason}` : ''}`).join('\n') || '- No evidence references listed.';
  const content = `---\nkind: private-research-paper-candidate\nschemaVersion: 1\nscanId: ${entry.scanId}\nsourceContentSha256: ${sourceHash}\npublicationStatus: candidate-only\ngeneratedAt: ${new Date().toISOString()}\n---\n\n# ${text(draft.title || entry.title)}\n\n> PRIVATE DRAFT — NOT APPROVED FOR PUBLICATION. Report-derived text has not been independently verified merely by appearing here.\n\n## Abstract\n\n${text(draft.summary || entry.excerpt?.slice(0, 1000))}\n\n## Research question\n\n${text(draft.researchQuestion)}\n\n## Why it matters\n\n${text(draft.whyItMatters)}\n\n## Methodology\n\n${text(draft.candidateMethod)}\n\n## Baseline and comparison conditions\n\nBaseline: ${text(draft.baseline)}\n\nComparison: ${text(draft.comparisonConditions)}\n\n## Test environment\n\n${text(draft.environment)}\n\n## Observed results\n\n${text(draft.result || draft.outcome)}\n\n## Measurements\n\n${draft.measurements && Object.keys(draft.measurements).length ? `Conditions: ${text(draft.measurementConditions)}\n\n\`\`\`json\n${JSON.stringify(draft.measurements, null, 2)}\n\`\`\`` : unknown}\n\n## Verification and lifecycle\n\n${text(draft.verificationStatus || entry.reportEvidenceClass)}; lifecycle: ${text(draft.lifecycleStatus || entry.reportStatus)}. Candidate generation does not certify claims.\n\n## Limitations and unresolved questions\n\n${text(draft.limitations)}\n\n## Related work\n\nResearch area: ${text(draft.researchArea)}\n\nRelated record IDs: ${(draft.relatedExperimentIds || []).join(', ') || unknown}\n\n## Provenance for reviewer\n\nPrivate report generated at ${text(scan.source?.generatedAt)}. Source section hash: ${entry.sectionSha256 || unknown}. Evidence-set digest: ${entry.evidenceDigest || unknown}.\n\n${references}\n\n### Source excerpt (private; not public-ready)\n\n\`\`\`text\n${String(entry.excerpt || '').replaceAll('```', "''' ")}\n\`\`\`\n\n## Approval status\n\n${entry.disposition || 'new-for-review'} — owner review, claim-scope review, privacy scan, and hash-bound approval are still required.\n`;
  const candidatePath = path.join(outputDir, `${entry.scanId}.md`);
  const previous = previousCandidates.get(entry.scanId);
  const unchanged = previous?.sourceContentSha256 === sourceHash && await fs.access(candidatePath).then(() => true, () => false);
  if (!unchanged) await fs.writeFile(candidatePath, content, 'utf8');
  generated.push({ scanId: entry.scanId, title: entry.title, sourceContentSha256: sourceHash, path: `${entry.scanId}.md`, publicationStatus: 'candidate-only', generation: unchanged ? 'unchanged' : 'created-or-updated' });
}
await fs.writeFile(path.join(outputDir, 'manifest.json'), `${JSON.stringify({ schemaVersion: 1, generatedAt: new Date().toISOString(), status: 'private-review-only', candidates: generated }, null, 2)}\n`, 'utf8');
process.stdout.write(`Indexed ${generated.length} private paper-style candidate(s); ${generated.filter(item => item.generation === 'created-or-updated').length} created or updated; none are approved or exported.\n`);
