# Security and publication boundary

- Static pages only. No user accounts, custom backend, database, visitor command surface, or connection to the private Lari runtime.
- Public data is a manually reviewed, site-local allowlist. The exporter requires exact queue IDs and an approval manifest tied to a report SHA-256.
- The exporter rejects unknown fields, local filesystem paths, private network addresses, and common credential-like values.
- Build output is generated only from website-local `data/approved/snapshot.json`; the full Lari report is never loaded by the site build.
- Do not place raw logs, runtime/model state, private paths, credentials, personal information, or fixture records in the review queue.
- Automated redaction is not semantic review. Inspect the rendered page and every selected source record before committing a public snapshot.
- GitHub Pages deploys only after a push to the dedicated website repository; this project does not deploy itself or configure DNS.
