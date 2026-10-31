# Search engine setup

The site emits static, crawlable HTML, a root `robots.txt`, canonical HTTPS URLs, a production XML sitemap, unique page metadata, and JSON-LD for the organization, website, page, and breadcrumbs. A sitemap and correct metadata help discovery; they do not guarantee indexing or rankings.

## Google Search Console

1. Add `https://whatslari.com/` as a Domain property in Search Console.
2. Complete domain ownership verification with the DNS TXT value supplied by Google. Do not commit the verification value to this repository.
3. After the website is published and HTTPS responds, submit `https://whatslari.com/sitemap.xml`.
4. Use URL Inspection for the homepage and important routes; request indexing only after the published pages return correctly.
5. Monitor Page indexing, crawl errors, and Core Web Vitals. Validate JSON-LD with Google's Rich Results Test when applicable; structured data does not guarantee a search feature.

## Bing Webmaster Tools

1. Add `https://whatslari.com/` and complete verification using the token or DNS record supplied by Bing.
2. Submit `https://whatslari.com/sitemap.xml` after the site is published.
3. Inspect canonical URLs, crawl errors, and sitemap freshness in URL Inspection and Site Explorer.
4. Consider IndexNow only after the website is live and its key-management requirements are reviewed. No key or indexing submission is configured in this repository.

## Before submitting

- Verify the GitHub Pages custom domain, HTTPS, apex/non-`www` canonical origin, and production redirects.
- Open the sitemap and robots file on the published domain. The sitemap should contain only canonical public routes and approved research details.
- Inspect page source to confirm the canonical, Open Graph/Twitter image and metadata, and JSON-LD are present in prerendered HTML.
- Search Console and Bing account setup remains an owner action. This repository contains no verification tokens and no account state has been assumed.
