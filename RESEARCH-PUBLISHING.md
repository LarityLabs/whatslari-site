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

## Human publication review

1. Inspect the private scan, structured ledger entry, candidate article, and each cited source artifact.
2. Use `npm run research:review` to record an explicit per-record decision and exact public-content hash in the ignored approval manifest.
3. Run `npm run research:validate` to check source freshness, evidence digest, candidate hash, public allowlist, claim scope, and privacy.
4. Run `npm run research:export` only after the owner has approved the exact records. Export preserves the previous approved snapshot for rollback; it does not push or deploy.
5. Run the site tests, `npm run check`, and `npm run build` before considering a local preview.

To restore a previously exported and retained snapshot locally, use `npm run research:rollback -- snapshot-YYYYMMDDhhmmss "reason for rollback"`. The command validates both snapshots, preserves the current one in immutable history, records a private rollback audit entry, and never publishes remotely.

The scan and paper generator do not certify claims or approve publication. A report update does not automatically place any record in the public snapshot. Static Lari Live activity is derived from the same approved experiment and milestone records used for article pages; there is no live runtime connection.

## Schema and revisions

Public records retain stable URL IDs. New records may specify `revision` (positive integer) and multiple `researchAreas`. Approved snapshots are content-digested and linked to the preceding snapshot; prior snapshots are retained under `data/approved/history/`. Corrections require fresh review and a new snapshot rather than silent edits to history.

## Current boundary

The public timeline displays the approved dated research milestones. The internal M0–M5 beta roadmap remains governed by its canonical private tracker and is not automatically copied into public pages. Promote any public-safe M0–M5 status only through the same record-level approval/export workflow.
