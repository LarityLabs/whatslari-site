# GitHub Discussions and giscus

## Launch status (2026-10-31)

GitHub reports that Discussions are enabled for `LarityLabs/whatslari-site`. The site build emits the supplied repository/category IDs and page-specific canonical-path configuration on every eligible route. Local browser execution against GitHub’s hosted giscus iframe has not yet been verified, so do not treat successful local generation as proof that reading, replies, or reactions work on the deployed domain. Verify the hosted iframe after Pages deployment.

The separate `experiment-requests` template is present at `.github/DISCUSSION_TEMPLATE/experiment-requests.yml`; its filename matches the configured request URL slug. The public repository was empty during inspection, so this template must reach the default branch before it can be selected. The available GitHub repository API does not expose Discussions category management; verify that an **Experiment Requests** category with slug `experiment-requests` exists, or create it in the repository’s Discussions settings and associate this template. The request form hands off to that category and does not submit until the visitor reviews and confirms on GitHub.

The site embeds giscus using the owner-confirmed configuration in `site.config.json`:

- Repository: `LarityLabs/whatslari-site`
- Repository ID: `R_kgDOVeJiZQ`
- Category: `Announcements`
- Category ID: `DIC_kwDOVeJiZc4DKFH5`
- Mapping: canonical `pathname`, strict matching (`1`)
- Reactions: enabled; metadata: enabled; comment box: top; iframe loading: lazy; language: English
- Theme: initialized from the site’s Light/Dark/System preference and synchronized when it changes

The generated discussion sections appear on `/live/`, `/live/experiments/`, `/live/capabilities/`, `/live/timeline/`, `/research/`, `/research/methods/`, `/research/verification-and-claim-scope/`, `/community/`, and each **approved** `/live/experiments/{id}/` detail page. They are not generated for candidate articles, the request form, or legacy redirect routes. The snapshot remains the sole source of approved experiment detail pages.

Each eligible page declares `meta[name="giscus:backlink"]` with its canonical trailing-slash URL and uses `pathname` mapping, so query strings do not create separate discussions or backlinks. Keep canonical URLs stable. With strict matching enabled, a matching discussion must contain giscus’s hash for its generated title; giscus includes it when it creates a new discussion. Do not reuse the Community welcome thread as a page comment thread. The widget creates no discussion during page load; a new page discussion may be created when a visitor submits their first comment or reaction after GitHub authorization.

The site requests discussion metadata and displays comment/reaction counts only after giscus sends metadata for a matching existing thread. No fallback or initial state invents counts. A load error shows a GitHub Discussions link. Reading is embedded; replying and reacting require GitHub authorization as prompted by GitHub.

## Experiment requests

The local proposal form hands off to `https://github.com/LarityLabs/whatslari-site/discussions/new?category=experiment-requests` and retains its copy/review step. `.github/DISCUSSION_TEMPLATE/experiment-requests.yml` is the GitHub category-form template; its filename must match the actual category slug. Confirm that the **Experiment Requests** category exists and that the template has reached the repository’s default branch before accepting submissions. The request flow is separate from the `Announcements` giscus category and from page-specific article threads. The site does not submit the proposal automatically.

## Verification

Run `npm test`, `npm run check`, and `npm run build`. Inspect the rendered `data-giscus-config` on each eligible canonical page and confirm no embed is generated on redirects or candidate-only pages. On the hosted domain, verify that the giscus frame loads without an origin/category error, pathname resolves consistently with and without query parameters, the browser theme control updates the iframe, and the current thread supports reading, GitHub-authorized replies, and reactions. Check a page without an existing thread separately; metadata is only emitted once a Discussion exists.

No credentials belong in `site.config.json`. The supplied IDs are public configuration, not secrets.
