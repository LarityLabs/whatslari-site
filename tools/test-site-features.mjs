import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
const snapshot = JSON.parse(await fs.readFile(path.join(root, 'data/approved/snapshot.json'), 'utf8'));
const htmlFiles = await fs.readdir(dist, { recursive: true });
const pages = htmlFiles.filter(file => String(file).endsWith(path.join('index.html')));
const staticRouteCount = 13;
const fixedLegacyRedirectCount = 8;
const experimentRouteCopies = 3; // canonical detail page plus two legacy redirects
assert.equal(pages.length, staticRouteCount + fixedLegacyRedirectCount + snapshot.experiments.length * experimentRouteCopies, 'canonical routes, approved experiment articles, and legacy redirects are prerendered');
assert.ok(htmlFiles.includes('google4aaa287e48ffc299.html'), 'Google site verification file is included in the generated site');
assert.equal(await fs.readFile(path.join(dist, 'google4aaa287e48ffc299.html'), 'utf8'), 'google-site-verification: google4aaa287e48ffc299.html');
assert.ok(pages.includes(path.join('research','experiments','index.html')));
assert.ok(pages.includes(path.join('research','capabilities','index.html')));
assert.ok(pages.includes(path.join('research','timeline','index.html')));
assert.ok(pages.includes(path.join('how-it-works', 'index.html')));
assert.ok(pages.includes(path.join('community', 'request-experiment', 'index.html')));
assert.ok(pages.includes(path.join('contact', 'index.html')));
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
assert.match(home, /A different kind of AI model/);
assert.match(home, /Built to learn\. Designed to be yours/);
assert.match(home, /experimental AI model architecture/);
assert.match(home, /What makes the model different/);
assert.match(home, /Why local AI matters/);
assert.match(home, /low-income households and underserved communities/);
assert.match(home, /have not established supported consumer hardware/);
assert.match(home, /How far we have got/);
assert.match(home, /Intelligence you can own\. Learning you can verify\./);
assert.match(home, /href="\/how-it-works\/">How the model is different/);
assert.match(home, /<noscript>|<main id="main"/);
assert.match(home, /href="\/contact\/">Contact/);
assert.match(home, /href="mailto:gorygrey@whatslari\.com"/);
assert.match(home, /href="tel:\+18143152009"/);
const about = await fs.readFile(path.join(dist, 'about/index.html'), 'utf8');
assert.match(about, /change who can own, control, and benefit from AI/);
assert.match(about, /consumer-device support, hardware requirements, performance, and cost savings have not been established/);
assert.doesNotMatch(about, /public observatory contains no approved research records/);
const communityPage = await fs.readFile(path.join(dist, 'community/index.html'), 'utf8');
assert.match(communityPage, /more accessible to people who are priced out/);
const homeMeta = home.match(/<meta name="description" content="([^"]+)"/)?.[1] || '';
assert.match(homeMeta, /experimental AI model architecture/);
assert.match(homeMeta, /local ownership/);
const methods = await fs.readFile(path.join(dist, 'research/verification-and-claim-scope/index.html'), 'utf8');
assert.match(methods, /This is a methods guide, not a report of a newly measured experiment\./);
const how = await fs.readFile(path.join(dist, 'how-it-works/index.html'), 'utf8');
assert.match(how, /LARI system architecture/);
assert.match(how, /id="kernel"/);
assert.match(how, /id="persistence"/);
assert.match(how, /unified task kernel/);
assert.match(how, /PUBLIC RESULT AWAITS REVIEW/);
assert.match(how, /alternative to AI systems/);
assert.match(how, /represent executable learned capabilities within the model architecture/);
assert.match(how, /User-scoped persistence is currently separate from the active base model/);
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
assert.match(requestPage, /The Experiment Requests category is active/);
assert.doesNotMatch(requestPage,/data-giscus-section/,'requests use their dedicated category, not an article thread');
assert.match(themeScript, /navigator\.clipboard\.writeText/);
const researchHub = await fs.readFile(path.join(dist, 'research/index.html'), 'utf8');
assert.equal((researchHub.match(/class=\"research-grid\"/g) || []).length, 1);
assert.match(researchHub, /Language generation/);
assert.match(researchHub, /Persistent model state/);
const contact = await fs.readFile(path.join(dist, 'contact/index.html'), 'utf8');
assert.match(contact, /href="mailto:gorygrey@whatslari\.com"/);
assert.match(contact, /href="tel:\+18143152009"/);
assert.match(contact, /Research collaborations/);
assert.match(contact, /ContactPage/);
assert.match(contact, /"email":"gorygrey@whatslari\.com"/);
assert.match(contact, /"telephone":"\+1-814-315-2009"/);
assert.match(about, /href="mailto:gorygrey@whatslari\.com"/);
assert.match(about, /href="tel:\+18143152009"/);
const researchPage = await fs.readFile(path.join(dist,'research/index.html'),'utf8');
const migratedRedirects = [
  ['live/index.html','/research/'],
  ['live/experiments/index.html','/research/experiments/'],
  ['live/capabilities/index.html','/research/capabilities/'],
  ['live/timeline/index.html','/research/timeline/'],
  ['experiments/index.html','/research/experiments/'],
  ['capabilities/index.html','/research/capabilities/'],
  ['development/index.html','/research/timeline/'],
  ['live/experiments/learning-state-verification-and-rollback/index.html','/research/experiments/'],
  ...snapshot.experiments.flatMap(row => [
    [`live/experiments/${row.id}/index.html`,`/research/experiments/${row.id}/`],
    [`experiments/${row.id}/index.html`,`/research/experiments/${row.id}/`]
  ])
];
for (const [file, destination] of migratedRedirects) {
  const html = await fs.readFile(path.join(dist,file),'utf8');
  assert.match(html,/name="robots" content="noindex,follow"/);
  assert.ok(html.includes('href="https://whatslari.com' + destination + '"'),file + ' preserves its Research destination');
  assert.ok(html.includes('location.replace(' + JSON.stringify(destination) + ')'),file + ' redirects automatically');
  assert.doesNotMatch(html,/data-giscus-section/,'legacy redirects do not create duplicate discussions');
}
assert.match(researchPage,/data-research-observatory/);
assert.doesNotMatch(researchPage,/href="\/live\//,'the Research section no longer links to the old section');
assert.match(researchPage,/Research into a developing architecture/);
assert.match(researchPage,/aria-label="Approved public research counts"/);
assert.match(researchPage,/research\/experiments\//);
assert.match(researchPage,/data-giscus-section/);
assert.match(researchPage,/data-giscus-config/);
assert.match(researchPage,/data-giscus-metadata/);
assert.match(researchPage,/data-live-activity/);
assert.match(researchPage,/assets\/live-observatory\.css/,'Research reuses the existing observatory layout');
assert.match(researchPage,/assets\/live-observatory\.js/,'Research reuses the existing interactive visualization');
assert.doesNotMatch(researchPage,/Previously on LARI|The story so far|data-recap-|class="live-recap"/,'the redundant recap carousel is removed');
assert.doesNotMatch(researchPage,/Reviewed research by area|research-story-list|researchStorySection/,'the duplicate full-summary area list is removed');
const storyOrder = ['id="observatory-title"','id="research-questions"','id="live-feed-title"','id="journey-title"','id="network-title"'].map(marker => researchPage.indexOf(marker));
const chapterNav = researchPage.indexOf('FOLLOW THE RESEARCH');
assert.ok(storyOrder.every((index,i) => index >= 0 && (i === 0 || storyOrder[i - 1] < index)) && storyOrder[0] < chapterNav && chapterNav < storyOrder[1],'the page follows a clear Ocean-to-questions-to-evidence scroll sequence');
const escapeHtml = value => String(value).replace(/[&<>"']/g,char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const journeyMarkup = (researchPage.match(/<ol class="journey-list">([\s\S]*?)<\/ol>/) || [,''])[1];
for (const milestone of snapshot.milestones.filter(row => row.relatedExperimentIds?.length)) assert.ok(!journeyMarkup.includes(escapeHtml(milestone.summary)), 'linked milestone summaries point to evidence instead of repeating it');
const networkDetail = (researchPage.match(/<article class="network-detail"[^>]*>[\s\S]*?<\/article>/) || [,''])[0];
assert.ok(networkDetail,'the evidence network has a selected-record detail');
assert.match(networkDetail,/Open this approved record/);
assert.doesNotMatch(networkDetail,/<h3>/,'network details link to the selected record without repeating its title');
assert.ok(snapshot.experiments.every(row => !networkDetail.includes(escapeHtml(row.summary))),'network details link to full records without repeating their summaries');
assert.match(researchPage,/assets\/live-observatory\.js\?v=[a-f0-9]{12}/,'Research invalidates the existing controller when its code changes');
assert.match(researchPage,/data-observatory-canvas/,'Research includes the existing GPU-enhanced ocean surface');
assert.match(researchPage,/data-observatory-fallback/,'Research includes the existing canvas fallback for browsers without WebGL2');
assert.match(researchPage,/data-ocean-zoom-in/,'the ocean has accessible zoom controls');
assert.match(researchPage,/id="observatory-title">Ocean of Intelligence</,'the binary ocean uses the requested concise title');
assert.match(researchPage,/aria-label="Interactive three-dimensional ocean/,'the canvas keeps its interaction guidance accessible');
assert.doesNotMatch(researchPage,/The ocean is drawn in your browser from moving 0s and 1s/,'the hero omits the unwanted visualization disclaimer');
assert.match(researchPage,/data-network-node=/,'approved experiment records are selectable network anchors');
assert.match(researchPage,/Private M0–M5 roadmap stages and progress are not exposed here/,'unapproved private roadmap details remain withheld');
assert.match(researchPage,new RegExp(`data-stat-value>${String(snapshot.experiments.length).padStart(2,'0')}<\\/span><small>Experiments`));
assert.match(researchPage,new RegExp(`data-stat-value>${String(snapshot.milestones.length).padStart(2,'0')}<\\/span><small>Milestones`));
assert.match(researchPage,new RegExp(`data-stat-value>${String(snapshot.metrics.length).padStart(2,'0')}<\\/span><small>Metrics`));
assert.doesNotMatch(researchPage,/observatory-record-anchors|observatory-pagination|data-observatory-anchor/,'the Ocean hero does not repeat the approved record feed');
assert.doesNotMatch(researchPage,/14 Approved Events|38%|E-014|R-009|Development Activity \(7d\)/,'mockup-only activity, labels, and percentages are not copied');
assert.match(researchPage,/data-activity-refresh/);
assert.match(researchPage,/data-areas="[^"]*"/);
assert.match(researchPage,/Open a record to see the tested scope and stated limits behind its summary/);
assert.ok(researchPage.includes('/research/timeline/'),'the reviewed timeline remains available in Research collections');
assert.doesNotMatch(researchPage,/Explore approved experiments ↗|Browse all experiments ↗/,'duplicate experiment calls to action are removed');
assert.match(researchPage,/No private runtime connection/);
assert.equal((researchPage.match(/data-activity-card/g)||[]).length,snapshot.experiments.length,'activity feed reuses approved research records without duplicating milestone claims');
const activityIds = [...researchPage.matchAll(/data-source-id="([a-z0-9-]+)"/g)].map(match => match[1]);
assert.equal(new Set(activityIds).size,activityIds.length,'the activity feed has no duplicate event identities');
const liveManifest = JSON.parse(await fs.readFile(path.join(root,'dist/data/manifest.json'),'utf8'));
assert.equal(liveManifest.snapshotId,snapshot.snapshotId);
assert.equal(liveManifest.contentDigest,snapshot.contentDigest);
assert.deepEqual(liveManifest.recordCounts,{ experiments:snapshot.experiments.length, capabilities:snapshot.capabilities.length, milestones:snapshot.milestones.length, metrics:snapshot.metrics.length });
const liveController = await fs.readFile(path.join(root,'dist/assets/site.js'),'utf8');
assert.match(liveController,/crypto\.subtle\.digest/);
assert.match(liveController,/setInterval\(checkForActivity, 60_000\)/);
assert.match(liveController,/Showing the last built approved snapshot/);
assert.match(liveController,/No new approved records/);
const binaryOcean = await fs.readFile(path.join(root,'dist/assets/binary-ocean.js'),'utf8');
const builtObservatory = await fs.readFile(path.join(root,'dist/assets/live-observatory.js'),'utf8');
const builtSite = await fs.readFile(path.join(root,'dist/assets/site.js'),'utf8');
const builtCrtController = await fs.readFile(path.join(root,'dist/assets/crt-entrance.js'),'utf8');
assert.match(builtObservatory,/from '\.\/binary-ocean\.js\?v=[a-f0-9]{12}'/,'Research imports the content-versioned existing ocean renderer');
assert.match(builtObservatory,/research-snapshot-updated/,'approved snapshots refresh the Research feed and relationship map');
assert.doesNotMatch(builtObservatory,/renderCarousel|data-observatory-anchor|observatory-record-anchors/,'duplicate Ocean record carousel controller is removed');
assert.doesNotMatch(builtObservatory,/renderRecap|data-recap-|lari-live-last-seen-v1|localStorage/,'the removed recap leaves no browser state or controller code');
assert.match(builtObservatory,/if\(!links\.length\)content\.append\(summary\)/,'only unlinked milestone summaries remain in the overview');
const observatoryCss = await fs.readFile(path.join(root,'dist/assets/live-observatory.css'),'utf8');

assert.match(observatoryCss,/grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/,'mobile public stats use a compact three-column row');
assert.match(observatoryCss,/grid-template-areas:"title" "ocean" "controls" "data"/,'mobile hero uses only defined grid areas');
assert.match(observatoryCss,/\.live-grid\{display:block\}/,'evidence and milestones form a sequential scroll story');
assert.doesNotMatch(observatoryCss,/\.recap-card|\.recap-controls|\.observatory-record-anchors|\.observatory-pagination|\.live-close/,'removed recap and duplicate cards have no leftover styling');
assert.match(home,/src="\/assets\/site\.js\?v=[a-f0-9]{12}"/,'the site entry point uses a content version');
assert.match(builtSite,/from '\.\/crt-entrance\.js\?v=[a-f0-9]{12}'/,'the CRT controller import uses a content version');
assert.match(builtCrtController,/from '\.\/binary-ocean\.js\?v=[a-f0-9]{12}'/,'the CRT and Research point to the same versioned renderer');
assert.match(builtCrtController,/from '\.\/crt-state-machine\.js\?v=[a-f0-9]{12}'/,'the CRT state machine import uses a content version');
assert.match(binaryOcean,/mountBinaryOcean/);
assert.match(binaryOcean,/const glyphs='01'/,'the Canvas fallback uses only binary glyphs');
assert.match(binaryOcean,/const glyphs=\['0','1'\]/,'the WebGL atlas uses only binary glyphs');
assert.match(binaryOcean,/matchMedia\('\(prefers-reduced-motion: reduce\)'\)/,'reduced-motion preference is respected');
assert.match(binaryOcean,/let paused = false/,'the ocean starts moving on page arrival');
assert.match(binaryOcean,/const motionScale = \(\) => reduced\.matches \? reducedMotionScale : 1/,'reduced-motion preference slows rather than freezes the ocean; each renderer can use a gentler scale');
assert.match(binaryOcean,/autoImpacts&&!reduced\.matches/,'automatic impact ripples are suppressed for reduced-motion visitors and configurable per renderer instance');
assert.match(binaryOcean,/Gentle binary ocean motion · reduced-motion preference/,'reduced-motion visitors receive an accurate motion status');
assert.match(binaryOcean,/new MutationObserver\(\(\) => applyCurrentTheme\(\)\)/,'site theme changes are observed without restarting the simulation');
assert.doesNotMatch(binaryOcean,/document\.body\.classList\.toggle\('light'/,'the ocean does not override the website theme');
await fs.access(path.join(root,'dist/assets/activity.css'));
const timelinePage = await fs.readFile(path.join(root,'dist/research/timeline/index.html'),'utf8');
assert.equal((timelinePage.match(/<details>/g)||[]).length,6,'approved timeline entries have expandable evidence details');
assert.match(timelinePage,/Related research:/);
const discussionRoutes = ['/research/','/research/experiments/','/research/capabilities/','/research/timeline/','/research/methods/','/research/verification-and-claim-scope/','/community/'];
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
assert.match(communityPage, /Use the embedded page discussion below for this hub/);
assert.doesNotMatch(communityPage, /Recent discussion cards are not embedded/);
const css = await fs.readFile(path.join(dist, 'assets/site.css'), 'utf8');
assert.match(css, /\[data-theme="dark"\]/);
assert.match(css, /color-scheme:dark/);
const mobileNav = home.match(/<nav id="mobile-nav"[^>]*>([\s\S]*?)<\/nav>/)?.[1] || '';
assert.match(mobileNav, /\/research\/capabilities\//);
assert.doesNotMatch(mobileNav, /\/live\//);
assert.match(mobileNav, /\/research\/timeline\//);
const primaryNav = home.match(/<nav aria-label="Main navigation">([\s\S]*?)<\/nav>/)?.[1] || '';
assert.match(primaryNav,/href="\/research\/"/,'Research is present in the primary navigation');
assert.doesNotMatch(primaryNav,/Lari Live|href="\/live\//,'the redundant Live section is removed from primary navigation');

const sitemap = await fs.readFile(path.join(dist, 'sitemap.xml'), 'utf8');
assert.ok(sitemap.startsWith('<?xml version="1.0" encoding="UTF-8"?>'));
const sitemapUrlCount = 13 + snapshot.experiments.length;
assert.equal((sitemap.match(/<url>/g) || []).length, sitemapUrlCount, 'sitemap lists canonical routes and approved articles, excluding aliases');
assert.equal((sitemap.match(/<lastmod>\d{4}-\d{2}-\d{2}<\/lastmod>/g) || []).length, sitemapUrlCount);
assert.doesNotMatch(sitemap.replace(/<\?xml[^>]+>/, ''), /\?|localhost|github\.io/i);
const robots = await fs.readFile(path.join(dist, 'robots.txt'), 'utf8');
assert.match(robots, /User-agent: \*\s+Allow: \/\s+Sitemap: https:\/\/whatslari\.com\/sitemap\.xml/);

for (const row of snapshot.experiments) assert.ok(communityPage.includes(`/research/experiments/${row.id}/#discussion-title`), `community discussion discovery links to ${row.id}`);
assert.equal(snapshot.status, 'approved');
assert.equal(snapshot.experiments.length, 5, 'the authorized public snapshot contains five experiments');
assert.equal(snapshot.capabilities.length, 3);
assert.equal(snapshot.milestones.length, 6);
assert.equal(snapshot.metrics.length, 0);
assert.deepEqual(new Set(snapshot.experiments.map(row => row.id)), new Set([
  'blank-workspace-javascript-construction','go-planner-research-to-construction','stateful-relational-induction',
  'five-bounded-coding-lanes','recap-bounded-language-and-composition'
]));
assert.ok(!snapshot.experiments.some(row => row.id === 'learning-state-verification-and-rollback'), 'the held lifecycle record is excluded from the public snapshot');
assert.ok(!pages.includes(path.join('research','experiments','learning-state-verification-and-rollback','index.html')), 'the held lifecycle record has no generated public article');
assert.ok(!snapshot.experiments.some(row => /cumulative|persistence/i.test(row.id)), 'held composition and fixture-backed persistence studies are excluded');
assert.equal(snapshot.sourceReport.sha256, undefined, 'private report hashes do not enter the public snapshot');
assert.equal(snapshot.sourceReport.fingerprint, undefined, 'private fingerprints do not enter the public snapshot');
for (const row of snapshot.experiments) {
  const route = `research/experiments/${row.id}/index.html`;
  assert.ok(pages.includes(route.split('/').join(path.sep)), `${row.id} has a prerendered canonical article`);
  const article = await fs.readFile(path.join(dist, route), 'utf8');
  assert.match(article, new RegExp(`<link rel="canonical" href="https://whatslari\\.com/research/experiments/${row.id}/">`));
  assert.match(article, new RegExp(`<meta property="og:image" content="https://whatslari\\.com/assets/social-cards/experiment-${row.id}\\.png">`));
  assert.match(article, /data-giscus-section/, `${row.id} has its own embedded discussion`);
  const widget = JSON.parse(article.match(/<script type="application\/json" data-giscus-config>([\s\S]*?)<\/script>/)?.[1] || 'null');
  const discussionNumbers = {
    'blank-workspace-javascript-construction':2,
    'go-planner-research-to-construction':3,
    'stateful-relational-induction':4,
    'five-bounded-coding-lanes':5,
    'recap-bounded-language-and-composition':6
  };
  assert.equal(widget?.mapping,'number',`${row.id} keeps its existing discussion after the canonical route moves`);
  assert.equal(widget?.term,discussionNumbers[row.id],`${row.id} remains linked to its seeded discussion`);
  assert.match(article, /<meta name="robots" content="index,follow"/);
}
assert.equal((researchHub.match(/id="live-feed"/g) || []).length, 1, 'Research presents the approved article set in one feed');
for (const row of snapshot.experiments) assert.ok(researchHub.includes(`/research/experiments/${row.id}/`), `${row.id} is linked from Research`);
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
