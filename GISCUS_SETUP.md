# GitHub Discussions and giscus

## Launch status (2026-10-31)

GitHub Discussions are enabled for `LarityLabs/whatslari-site`, and the giscus GitHub App is installed. The site build emits the configured repository/category IDs and page-specific canonical-path settings on each eligible route. Six approved article discussions have been seeded and their GitHub pages verified (see the table below). The live giscus iframe still needs hosted-domain verification after this release; discussion-page availability alone does not prove the embed, theme synchronization, replies, or reactions work on whatslari.com.

The separate **Experiment Requests** category was created in repository settings as an open-ended discussion category. Its verified handoff slug is `experiment-requests`, matching both the native request form and `.github/DISCUSSION_TEMPLATE/experiment-requests.yml`. The form keeps a local review and copy step; GitHub requires the visitor to review and submit the proposal there.

The site embeds giscus using the owner-confirmed configuration in `site.config.json`:

- Repository: `LarityLabs/whatslari-site`
- Repository ID: `R_kgDOVeJiZQ`
- Category: `Announcements`
- Category ID: `DIC_kwDOVeJiZc4DKFH5`
- Mapping: canonical `pathname`, strict matching (`1`)
- Reactions: enabled; metadata: enabled; comment box: top; iframe loading: lazy; language: English
- Theme: initialized from the site’s Light/Dark/System preference and synchronized when it changes

The generated discussion sections appear on `/live/`, `/live/experiments/`, `/live/capabilities/`, `/live/timeline/`, `/research/`, `/research/methods/`, `/research/verification-and-claim-scope/`, `/community/`, and each **approved** `/live/experiments/{id}/` detail page. They are not generated for candidate articles, the request form, or legacy redirect routes. The snapshot remains the sole source of approved experiment detail pages.

Each eligible page declares `meta[name="giscus:backlink"]` with its canonical trailing-slash URL and uses `pathname` mapping, so query strings do not create separate discussions or backlinks. Keep canonical URLs stable. With strict matching enabled, giscus hashes the page's mapped search term (the canonical pathname here) and finds that SHA-1 in the discussion body; the six seeded discussions carry the corresponding `<!-- sha1: … -->` marker. giscus adds its marker automatically when it creates a new thread. Do not reuse the Community welcome thread as a page comment thread. The widget creates no discussion during page load; a new page discussion may be created when a visitor submits their first comment or reaction after GitHub authorization.

### Seeded approved-article discussions

| Article route | GitHub Discussion |
| --- | --- |
| `/live/experiments/blank-workspace-javascript-construction/` | [#2](https://github.com/LarityLabs/whatslari-site/discussions/2) |
| `/live/experiments/go-planner-research-to-construction/` | [#3](https://github.com/LarityLabs/whatslari-site/discussions/3) |
| `/live/experiments/stateful-relational-induction/` | [#4](https://github.com/LarityLabs/whatslari-site/discussions/4) |
| `/live/experiments/five-bounded-coding-lanes/` | [#5](https://github.com/LarityLabs/whatslari-site/discussions/5) |
| `/live/experiments/recap-bounded-language-and-composition/` | [#6](https://github.com/LarityLabs/whatslari-site/discussions/6) |
| `/live/experiments/learning-state-verification-and-rollback/` | [#7](https://github.com/LarityLabs/whatslari-site/discussions/7) |

Each seed is in `Announcements`, links to its approved public article, and includes a SHA-1 marker for the canonical pathname required by strict matching. The discussion content retains the article's scoped result and limits and invites methods-focused replies. No held research was included.

The site requests discussion metadata and displays comment/reaction counts only after giscus sends metadata for a matching existing thread. No fallback or initial state invents counts. A load error shows a GitHub Discussions link. Reading is embedded; replying and reacting require GitHub authorization as prompted by GitHub.

## Experiment requests

The local proposal form hands off to `https://github.com/LarityLabs/whatslari-site/discussions/new?category=experiment-requests` and retains its copy/review step. `.github/DISCUSSION_TEMPLATE/experiment-requests.yml` is the GitHub category-form template; its filename must match the actual category slug. Confirm that the **Experiment Requests** category exists and that the template has reached the repository’s default branch before accepting submissions. The request flow is separate from the `Announcements` giscus category and from page-specific article threads. The site does not submit the proposal automatically.

## Verification

Run `npm test`, `npm run check`, and `npm run build`. Inspect the rendered `data-giscus-config` on each eligible canonical page and confirm no embed is generated on redirects or candidate-only pages. On the hosted domain, verify that the giscus frame loads without an origin/category error, pathname resolves consistently with and without query parameters, the browser theme control updates the iframe, and the current thread supports reading, GitHub-authorized replies, and reactions. Check a page without an existing thread separately; metadata is only emitted once a Discussion exists.

No credentials belong in `site.config.json`. The supplied IDs are public configuration, not secrets.
