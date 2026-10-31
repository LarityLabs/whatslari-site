# whatslari.com

Static-first official LARI website and public research observatory. LARI means **Local Autonomous Recursive Intelligence**. Brand assets follow corrected kit v4. The project is separate from the private Lari runtime and has no public backend.

## Local build

Requirements: Node.js 20 or later. There are no third-party runtime or build dependencies.

```powershell
npm test
npm run build
npm run check
```

This is a standalone website repository configured for `https://github.com/LarityLabs/whatslari-site`. Keep the private LARI workspace separate from this public project.

The build writes the static site to `dist/`. On Windows, keep the local preview server running in its own PowerShell window:

```powershell
npm run build
python -m http.server 4173 --directory dist --bind 127.0.0.1
```

Then open `http://127.0.0.1:4173/?intro=replay`. If the browser shows `ERR_CONNECTION_REFUSED`, the server process is not running; leave the PowerShell command open while testing. CRT timing and audio cue points are centralized in `assets/crt-state-machine.js`: the approved 3.40-second tube recording begins on the physical power interaction, and the 4.00-second modem recording begins about 1.37 seconds later. The local-only frozen CRT inspection frames are documented in `tools/CRT-IGNITION-QA.md`. Audio playback is requested directly from the power-button gesture; browser playback restrictions fall back to the same visual sequence without audio. The files are kept untrimmed; the power recording is attenuated to balance its higher measured RMS level. The homepage entrance can be skipped or replayed from the footer.

The public observatory is populated only from individually reviewed records in the approved snapshot. Editorial drafts, raw scan excerpts, and review decisions stay in ignored `private-review/`; they are never copied into the site build. Scanning the designated source never edits it and never approves, exports, commits, or deploys a record.

## Local research review pipeline

The scanner requires `LARI_REPORT_PATH` to be set in the local command environment to the designated canonical report. Do not store this path in repository files or commit it. All scan output, raw excerpts, absolute paths, reference hashes, and review decisions stay under ignored `private-review/`.

```powershell
npm run research:scan
npm run research:review
npm run research:validate
npm run research:export
npm run social:cards
npm run build
npm run check
```

`research:scan` indexes substantive report sections, their declared report-derived status, source section hashes, local linked-artifact resolution, and duplicates. Unresolved references are reported for follow-up. A resolved file is not automatically accepted as proof; its contents still need review. Candidate status remains report-derived until its primary artifacts are checked.

`research:review` is an interactive local owner workflow. It shows each new or changed section, reference state, and a bounded excerpt. Choose approve, edit-and-approve, reject, defer, or request verification. Approval asks for public title, summary, limitations, provenance, evidence labels, research details, and any measurements/conditions; it then requires typing `APPROVE <public-id>`. There is no blanket approval and the tool does not publish. Never put raw paths, private IDs, hashes, prompts, or traces into public wording. An unchanged source section can retain its record receipt across an unrelated report refresh; changed sections and changed public text require renewed review.

`research:validate` checks current report/scan consistency, each staging record's explicit owner receipt, exact approved content hash, unchanged source section and linked-evidence hash set, schema, and privacy scan. `research:export` repeats these checks, writes a versioned snapshot with a content digest, and archives the prior approved snapshot when one exists. Export changes only local public-data files; it does not push or deploy. After export, regenerate the unique approved-experiment social cards with `npm run social:cards`; the build fails closed if an experiment's branded preview image is missing. The website build also rejects a modified approved record or snapshot that does not reconcile to the review receipts.

The public schema is versioned. Unknown values remain `null` where supported; unavailable measurements are omitted; each nonempty measurement set requires its conditions. Relationships must point to existing public record IDs. Approved snapshots are historical releases and do not imply a live connection to the model. Metrics are shown individually with their conditions; incompatible comparisons are not combined into a progress score.

The site explains LARI as a developing local AI architecture; its architecture page is separate from the research-methods guide. The site provides Light, Dark, and System themes; a static research observatory and architecture guide; a separate evidence-methods guide; experiment and capability collection views; and an experiment-request page. giscus discussions are embedded on Lari Live collections, selected Research pages, the Community hub, and approved experiment detail pages. The experiment request form hands off to the separate `experiment-requests` Discussion category. See `GISCUS_SETUP.md` for the confirmed configuration and the remaining hosted category/template checks.

## Project map

- `tools/build.mjs` generates the 13 editorial routes, any approved experiment detail routes, and SEO files.
- `tools/generate-social-cards.py` renders reusable 1200×630 branded PNG cards and a contact sheet. Pillow is needed only when regenerating these checked-in assets.
- `tools/research-scan.mjs`, `tools/research-review.mjs`, `tools/approval-validation.mjs`, and `tools/validate-approved-data.mjs` implement private discovery and per-record review. `tools/export-approved-data.mjs` creates a website-local snapshot only after explicit approval receipts match the reviewed records and source sections.
- `data/review-queue/records.json` is the reviewed-record staging area; it must contain only approved, allowlisted fields.
- `private-review/approval-manifest.json` records the reviewer, report identity, review time, and exact per-record content receipts; it is ignored and never shipped. `data/approved/history/` stores previous public snapshots.
- `data/approved/snapshot.json` is the only data source read by the website build.
- `assets/` contains v4 logos, the master glyph, favicon, platform icons, hero artwork, design tokens, the copied Gateway 2000 SVG, and the two approved, unmodified MP3 recordings under clean public names. The brand-kit source directory is never modified.
- `.github/workflows/pages.yml` builds and deploys GitHub Pages on pushes to `main`; publication remains gated on an explicit owner authorization.
- `BRAND_GUIDE.md`, `SECURITY.md`, and `DEPLOYMENT.md` document the public-facing brand and operating boundaries. `GISCUS_SETUP.md` documents the remaining hosted embed verification and separate experiment-request category setup.
- `SEARCH_ENGINE_SETUP.md` documents Search Console and Bing Webmaster Tools owner steps. No verification tokens or account state are stored in the repository.

The build does not read the Lari checkout, copy a full report, connect to local services, or publish externally.
