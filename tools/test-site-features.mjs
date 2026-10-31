import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
const htmlFiles = await fs.readdir(dist, { recursive: true });
const pages = htmlFiles.filter(file => String(file).endsWith('.html'));
assert.equal(pages.length, 28, 'canonical routes, approved experiment articles, and legacy redirects are prerendered');
assert.ok(pages.includes(path.join('live','experiments','index.html')));
assert.ok(pages.includes(path.join('live','capabilities','index.html')));
assert.ok(pages.includes(path.join('live','timeline','index.html')));
assert.ok(pages.includes(path.join('how-it-works', 'index.html')));
assert.ok(pages.includes(path.join('community', 'request-experiment', 'index.html')));
assert.ok(pages.includes(path.join('research', 'verification-and-claim-scope', 'index.html')));
assert.ok(pages.includes(path.join('research', 'methods', 'index.html')));

const titles = new Set();
for (const file of pages) {
  const html = await fs.readFile(path.join(dist, file), 'utf8');
  if (html.includes('name="robots" content="noindex,follow"')) { assert.match(html, /rel="canonical"/); assert.match(html, /location\.replace\(/); continue; }
  const title = html.match(/<title>([^<]+)<\/title>/)?.[1];
  assert.ok(title, `${file} has a title`);
  assert.ok(!titles.has(title), `title is unique: ${title}`);
  titles.add(title);
  assert.match(html, /<meta name="description" content="[^"]{50,}"/);
  assert.match(html, /<meta name="robots" content="index,follow"/);
  assert.match(html, /<link rel="canonical" href="https:\/\/whatslari\.com\/(?:[^"?]*)"/);
  assert.doesNotMatch(html, /127\.0\.0\.1|localhost|file:\/\//i);
  assert.match(html, /property="og:image:width" content="1200"/);
  assert.match(html, /property="og:image:height" content="630"/);
  assert.match(html, /name="twitter:card" content="summary_large_image"/);
  assert.match(html, /name="twitter:image:alt" content="[^"]+"/);
  assert.match(html, /type="application\/ld\+json">\{"@context":"https:\/\/schema\.org","@graph":\[/);
  const jsonLd = html.match(/<script type="application\/ld\+json">([^<]+)<\/script>/)?.[1];
  assert.ok(jsonLd && JSON.parse(jsonLd)['@graph']?.length >= 3, `${file} contains parseable JSON-LD`);
  const ogImage = html.match(/property="og:image" content="https:\/\/whatslari\.com(\/[^\"]+)"/)?.[1];
  assert.ok(ogImage, `${file} declares a production OG image`);
  await fs.access(path.join(dist, ogImage.replace(/^\//, '')));
}

const home = await fs.readFile(path.join(dist, 'index.html'), 'utf8');
assert.match(home, /developing AI architecture/);
assert.match(home, /experimental AI model architecture/);
assert.match(home, /long-term research goal/);
assert.match(home, /not a demonstrated current capability/);
assert.match(home, /href="\/how-it-works\/">Explore the architecture/);
assert.match(home, /Local intelligence/);
assert.match(home, /<noscript>|<main id="main"/);
const methods = await fs.readFile(path.join(dist, 'research/verification-and-claim-scope/index.html'), 'utf8');
assert.match(methods, /This is a methods guide, not a report of a newly measured experiment\./);
const how = await fs.readFile(path.join(dist, 'how-it-works/index.html'), 'utf8');
assert.match(how, /LARI system architecture/);
assert.match(how, /id="kernel"/);
assert.match(how, /id="persistence"/);
assert.match(how, /unified task kernel/);
assert.match(how, /PUBLIC RESULT AWAITS REVIEW/);
assert.doesNotMatch(how, /negative-division|two supplied documentation fixtures|fixture-backed test/i, 'unapproved candidate measurements do not appear in public architecture copy');
const researchMethods = await fs.readFile(path.join(dist, 'research/methods/index.html'), 'utf8');
assert.equal((researchMethods.match(/<details/g) || []).length, 6, 'evaluation workflow remains expandable on the methods page');
assert.match(researchMethods, /research method—not LARI’s technical architecture/);

const themeScript = await fs.readFile(path.join(dist, 'assets/site.js'), 'utf8');
assert.match(home, /localStorage\.getItem\('lari-theme'\)/);
assert.match(home, /id="theme-choice" aria-label="Color theme"/);
assert.match(themeScript, /localStorage\.setItem\('lari-theme', preference\)/);
assert.match(themeScript, /prefers-color-scheme: dark/);
assert.match(themeScript, /giscus\.app/);
assert.match(themeScript, /totalCommentCount/);
assert.match(themeScript, /reactionCount/);
assert.match(themeScript, /Number\.isFinite/);
assert.match(themeScript, /setGiscusError/);
assert.match(themeScript, /data-request-form/);
const requestPage = await fs.readFile(path.join(dist, 'community/request-experiment/index.html'), 'utf8');
for (const field of ['title','question','hypothesis','test','expected','criteria']) assert.match(requestPage, new RegExp('name=\"'+field+'\"'));
assert.match(requestPage, /data-request-review/);
assert.match(requestPage, /discussions\/new\?category=experiment-requests/);
assert.doesNotMatch(requestPage,/data-giscus-section/,'requests use their dedicated category, not an article thread');
assert.match(themeScript, /navigator\.clipboard\.writeText/);
const researchHub = await fs.readFile(path.join(dist, 'research/index.html'), 'utf8');
assert.equal((researchHub.match(/class=\"research-grid\"/g) || []).length, 1);
assert.match(researchHub, /Language generation/);
assert.match(researchHub, /Persistent model state/);
const livePage = await fs.readFile(path.join(dist,'live/index.html'),'utf8');
assert.match(livePage,/APPROVED DATA/);
assert.match(livePage,/6 approved/);
assert.match(livePage,/live\/experiments\//);
assert.match(livePage,/data-giscus-section/);
assert.match(livePage,/data-giscus-config/);
assert.match(livePage,/data-giscus-metadata/);
const discussionRoutes = ['/live/','/live/experiments/','/live/capabilities/','/live/timeline/','/research/','/research/methods/','/research/verification-and-claim-scope/','/community/'];
for (const route of discussionRoutes) {
  const pagePath = path.join(route.replace(/^\//,'').replace(/\/$/,''),'index.html');
  const html = await fs.readFile(path.join(dist,pagePath),'utf8');
  const serialized = html.match(/<script type="application\/json" data-giscus-config>([\s\S]*?)<\/script>/)?.[1];
  assert.ok(serialized, `${route} has its generated giscus config`);
  const widget = JSON.parse(serialized);
  assert.deepEqual(widget, { repo:'LarityLabs/whatslari-site', repoId:'R_kgDOVeJiZQ', category:'Announcements', categoryId:'DIC_kwDOVeJiZc4DKFH5', mapping:'pathname', strict:'1', reactionsEnabled:'1', emitMetadata:'1', inputPosition:'top', lang:'en', loading:'lazy' });
  assert.match(html, new RegExp(`<meta name="giscus:backlink" content="https://whatslari\\.com${route.replaceAll('/','\\/')}">`), `${route} has a canonical giscus backlink`);
  assert.match(html, /data-giscus-metadata[^>]*hidden/, `${route} hides counts until real giscus metadata arrives`);
  assert.equal((html.match(/data-giscus-section/g)||[]).length,1,`${route} emits one widget`);
}
assert.doesNotMatch(home,/data-giscus-section/,'home CRT page does not create an unrelated discussion');
assert.doesNotMatch(requestPage,/data-giscus-section/,'proposal page does not use an article discussion');
assert.doesNotMatch(requestPage,/name="giscus:backlink"/,'proposal page has no article-thread backlink');
const docs = await fs.readFile(path.join(dist, 'docs/index.html'), 'utf8');
assert.match(docs, /Page-specific discussions use the configured GitHub Discussions category/);
assert.doesNotMatch(docs, /comments remain disabled/i, 'evidence guide does not claim giscus is disabled');
const community = await fs.readFile(path.join(dist, 'community/index.html'), 'utf8');
assert.match(community, /Use the embedded page discussion below for this hub/);
assert.doesNotMatch(community, /Recent discussion cards are not embedded/);
const css = await fs.readFile(path.join(dist, 'assets/site.css'), 'utf8');
assert.match(css, /\[data-theme="dark"\]/);
assert.match(css, /color-scheme:dark/);
const mobileNav = home.match(/<nav id="mobile-nav"[^>]*>([\s\S]*?)<\/nav>/)?.[1] || '';
assert.match(mobileNav, /\/live\/capabilities\//);
assert.match(mobileNav, /\/live\/timeline\//);

const sitemap = await fs.readFile(path.join(dist, 'sitemap.xml'), 'utf8');
assert.ok(sitemap.startsWith('<?xml version="1.0" encoding="UTF-8"?>'));
assert.equal((sitemap.match(/<url>/g) || []).length, 19, 'sitemap lists canonical routes and approved articles, excluding aliases');
assert.equal((sitemap.match(/<lastmod>\d{4}-\d{2}-\d{2}<\/lastmod>/g) || []).length, 19);
assert.doesNotMatch(sitemap.replace(/<\?xml[^>]+>/, ''), /\?|localhost|github\.io/i);
const robots = await fs.readFile(path.join(dist, 'robots.txt'), 'utf8');
assert.match(robots, /User-agent: \*\s+Allow: \/\s+Sitemap: https:\/\/whatslari\.com\/sitemap\.xml/);

const snapshot = JSON.parse(await fs.readFile(path.join(root, 'data/approved/snapshot.json'), 'utf8'));
assert.equal(snapshot.status, 'approved');
assert.equal(snapshot.experiments.length, 6);
assert.equal(snapshot.capabilities.length, 3);
assert.equal(snapshot.milestones.length, 6);
assert.equal(snapshot.metrics.length, 0);
assert.deepEqual(new Set(snapshot.experiments.map(row => row.id)), new Set([
  'blank-workspace-javascript-construction','go-planner-research-to-construction','stateful-relational-induction',
  'five-bounded-coding-lanes','recap-bounded-language-and-composition','learning-state-verification-and-rollback'
]));
assert.ok(!snapshot.experiments.some(row => /cumulative|persistence/i.test(row.id)), 'held composition and fixture-backed persistence studies are excluded');
assert.equal(snapshot.sourceReport.sha256, undefined, 'private report hashes do not enter the public snapshot');
assert.equal(snapshot.sourceReport.fingerprint, undefined, 'private fingerprints do not enter the public snapshot');
for (const row of snapshot.experiments) {
  const route = `live/experiments/${row.id}/index.html`;
  assert.ok(pages.includes(route.split('/').join(path.sep)), `${row.id} has a prerendered canonical article`);
  const article = await fs.readFile(path.join(dist, route), 'utf8');
  assert.match(article, new RegExp(`<link rel="canonical" href="https://whatslari\\.com/live/experiments/${row.id}/">`));
  assert.match(article, new RegExp(`<meta property="og:image" content="https://whatslari\\.com/assets/social-cards/experiment-${row.id}\\.png">`));
  assert.match(article, /data-giscus-section/, `${row.id} has its own embedded discussion`);
  assert.match(article, /<meta name="robots" content="index,follow"/);
}
assert.equal((researchHub.match(/class="research-story-links"/g) || []).length, 1, 'Research links to the approved article set');
for (const row of snapshot.experiments) assert.ok(researchHub.includes(`/live/experiments/${row.id}/`), `${row.id} is linked from Research`);
const allPublicText = await Promise.all(htmlFiles.filter(file => String(file).endsWith('.html')).map(file => fs.readFile(path.join(dist, file), 'utf8')));
const corpus = allPublicText.join('\n');
assert.doesNotMatch(corpus, /research framework: propose|A research loop,\s*not a promise|What if intelligence could learn/i, 'site positioning explains the AI architecture');
for (const privateField of ['privateSourceRecordRef', 'activeModelSha256', 'proofArtifactSha256', 'private-review', 'candidate-records.json']) assert.ok(!corpus.includes(privateField), `public HTML excludes ${privateField}`);
assert.equal(htmlFiles.some(file => String(file).includes('private-review')), false);
const ignore = await fs.readFile(path.join(root, '.gitignore'), 'utf8');
assert.match(ignore, /\/private-review\//);
assert.match(ignore, /\/dist\//);
assert.match(ignore, /\.env/);

process.stdout.write('Theme, route, SEO, architecture, social-card, and public/private isolation checks passed.\n');
