// Safe private indexing entry point: updates the scan and append-only ledger, but not paper drafts.
process.env.LARI_SKIP_DRAFT_GENERATION = '1';
await import('./research-scan.mjs');
