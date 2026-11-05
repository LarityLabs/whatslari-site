# Research publishing workflow

The website generator reads only `data/approved/snapshot.json`. It never reads the LARI runtime, the full report, or private research artifacts.

## Private preparation

The canonical LARI `npm run lari:report` workflow now invokes `scripts/update_lari_website_research_index.js` after it finishes generating the full report. The bridge runs the website's local research scan and generates paper-style candidate drafts under ignored `private-review/`. If the website checkout is unavailable, the report still completes and the bridge writes a private skipped/failed status when possible.

You can run the private steps directly from this website repository:

```powershell
$env:LARI_REPORT_PATH = 'PATH_TO_THE_LOCAL_LARI_FULL_REPORT.md'
npm run research:scan
npm run research:drafts
```

The scan keeps a private append-only `private-review/research-ledger.jsonl` and replaces the current `research-scan.json`. Paper candidates are labeled unapproved; unknown and untested fields remain explicit. Candidate Markdown, local evidence references and hashes remain ignored and are not copied to `dist/`.

For an incremental source index that must not regenerate paper drafts, run `npm run research:index`. It updates the private scan and ledger only. The existing `research:scan` command retains its prior scan-plus-draft behavior for the full-report workflow.

When a report fingerprint changes, use `npm run research:rebind` to inspect a hash-bound plan before applying it. Apply only an all-unchanged plan with the exact `APPLY REBIND PLAN <plan-sha256>` confirmation. Rebinding updates proposal source identity, not approval state; changed or unresolved evidence remains held for review.

## Human publication review

1. Inspect the private scan, structured ledger entry, candidate article, and each cited source artifact.
2. Use `npm run research:review` in the local CLI to record a decision. Approval requires typing `AUTHORIZE <stable-record-id> REPORT <current-report-sha256> CONTENT <approved-content-sha256>` for the exact record. A retry appends another event; it does not replace the previous event.
3. Run `npm run research:validate` to check the exact report and source fingerprint, scan entry, unique report section, hashable evidence files, per-record content hash, current owner authorization, allowlist, public claim scope, and privacy.
4. Run `npm run research:export` only after the owner has approved the exact records. Export preserves the previous approved snapshot for rollback; it does not push or deploy.
5. Run the site tests, `npm run check`, and `npm run build` before considering a local preview.

To restore a previously exported and retained snapshot locally, use `npm run research:rollback -- snapshot-YYYYMMDDhhmmss "reason for rollback"`. The command validates both snapshots, preserves the current one in immutable history, records a private rollback audit entry, and never publishes remotely.

Current approval state is a schema-3 projection of `private-review/decision-events.jsonl`. Existing schema-2 receipts and decisions are archived byte-for-byte on first review and entered as legacy events; legacy events preserve history but never authorize a newer source identity. The event log uses a SHA-256 linked sequence to detect edits to individual events or chain links. It is not a digital signature and does not independently authenticate the reviewer's real-world identity.

Focused publication-lineage checks run with `npm run research:test-lineage`; they use disposable copies under the operating-system temporary directory. They do not reauthorize production records or export a snapshot.

The scan and paper generator do not certify claims or approve publication. A report update does not automatically place any record in the public snapshot. Static Lari Live activity is derived from the same approved experiment and milestone records used for article pages; there is no live runtime connection.

## Schema and revisions

Public records retain stable URL IDs. New records may specify `revision` (positive integer) and multiple `researchAreas`. Approved snapshots are content-digested and linked to the preceding snapshot; prior snapshots are retained under `data/approved/history/`. Corrections require fresh review and a new snapshot rather than silent edits to history.

## Current boundary

The public timeline displays the approved dated research milestones. The internal M0–M5 beta roadmap remains governed by its canonical private tracker and is not automatically copied into public pages. Promote any public-safe M0–M5 status only through the same record-level approval/export workflow.
