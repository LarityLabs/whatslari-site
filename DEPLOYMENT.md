# Deployment status

The local website folder is a standalone Git repository connected to `https://github.com/LarityLabs/whatslari-site`. It is separate from the private Lari runtime. The owner authorized the six reviewed research stories and the website launch on 2026-10-31; the public snapshot contains only those six experiments, three capability entries, and six timeline entries. Cumulative composition and fixture-backed persistence remain excluded.

The repository API reported Pages disabled (`has_pages: false`) during this launch preparation. A push to `main` will run the checked GitHub Actions workflow, but an administrator must select **Settings → Pages → Build and deployment → GitHub Actions** if the repository does not enable Pages automatically. After that, set `whatslari.com` as the custom domain and confirm DNS and HTTPS in GitHub. Do not claim deployment until the workflow succeeds and the live canonical pages are fetched successfully.

## GitHub Pages

1. Re-run `npm test`, `npm run check`, and `npm run build` sequentially; inspect the staged file list and public snapshot for private material.
2. Push the audited website repository to `main` under the owner’s explicit launch authorization.
3. In repository Settings → Pages, choose **GitHub Actions** as the source if the workflow reports that Pages is not configured.
4. The workflow at `.github/workflows/pages.yml` runs tests and checks, builds `dist/`, and deploys the artifact on a push to `main` or manual dispatch.
5. Add `whatslari.com` as the custom domain in Pages settings. The workflow artifact includes `CNAME`.
6. Verify DNS and enable HTTPS after GitHub confirms the domain configuration.

## DNS at Northwest Registered Agent

At the registrar, verify that the apex and `www` records match GitHub’s current Pages custom-domain requirements before making DNS changes. DNS settings were not changed as part of this launch. Confirm the domain check and HTTPS certificate status in GitHub Pages after DNS is configured.

## Data snapshot updates

1. Select individual records from current Lari evidence and review each record’s wording, scope, provenance, and privacy.
2. Add only the allowed fields to `data/review-queue/records.json`.
3. Record the exact source report SHA-256, reviewer identity, approval time, and exact record IDs in `data/approval-manifest.json`.
4. Run `npm run export:approved`, then `npm run check` and `npm run build`.
5. Inspect `dist/data/snapshot.json` and rendered pages. Commit only the reviewed snapshot through the website repository’s normal review process.

No unattended publisher is configured. The export command writes local files only.

## Rollback and troubleshooting

- Revert the website repository to a previously reviewed commit to roll back a site or data update.
- A failed build blocks the Pages artifact; inspect the schema or path/credential scan output.
- If custom-domain HTTPS is pending, check DNS propagation and the GitHub Pages domain verification state before changing records.
- `npm run check` verifies the local build output, schema, safety patterns, terminology, landmarks, and internal routes.

## External integrations

The site is configured for page-specific giscus discussions and a separate experiment-request handoff. Hosted frame behavior and the `experiment-requests` category still require GitHub-side verification. See `GISCUS_SETUP.md`. No client-side authentication token is needed or supported.
