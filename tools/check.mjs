import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { validateSnapshot, scanPublicText } from './data-schema.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const snapshot = JSON.parse(await fs.readFile(path.join(root, 'data/approved/snapshot.json'), 'utf8'));
const problems = [...validateSnapshot(snapshot), ...scanPublicText(snapshot)];
const config = JSON.parse(await fs.readFile(path.join(root, 'site.config.json'), 'utf8'));
if (config.brandName !== 'LARI' || config.brandExpansion !== 'Local Autonomous Recursive Intelligence' || config.brandKitVersion !== 4) problems.push('site brand configuration is not v4-correct');
const wrongExpansion = ['User-Owned', 'Learning Intelligence'].join(' ');
const rightExpansion = 'Local Autonomous Recursive Intelligence';
const files = await fs.readdir(path.join(root, 'dist'), { recursive: true });
if (!files.includes('index.html') || !files.includes(path.join('live', 'index.html'))) problems.push('core static routes are missing');
const htmlFiles = files.filter(file => String(file).endsWith(path.join('index.html')));
const googleVerification = await fs.readFile(path.join(root, 'dist', 'google4aaa287e48ffc299.html'), 'utf8').catch(() => '');
if (googleVerification !== 'google-site-verification: google4aaa287e48ffc299.html') problems.push('Google site verification file is missing or has unexpected content');
const canonicalHtmlFiles = [];
for (const file of htmlFiles) { const source = await fs.readFile(path.join(root, 'dist', file), 'utf8'); if (source.includes('name="robots" content="noindex,follow"')) { if (!source.includes('rel="canonical"') || !source.includes('location.replace(')) problems.push(`${file} legacy route is missing canonical redirect behavior`); } else canonicalHtmlFiles.push(file); }
const expectedRoutes = [
  'index.html', path.join('how-it-works', 'index.html'), path.join('live', 'index.html'),
  path.join('live', 'experiments', 'index.html'), path.join('live', 'timeline', 'index.html'), path.join('research', 'index.html'),
  path.join('research', 'verification-and-claim-scope', 'index.html'), path.join('research', 'methods', 'index.html'),
  path.join('live', 'capabilities', 'index.html'), path.join('community', 'index.html'),
  path.join('community', 'request-experiment', 'index.html'), path.join('docs', 'index.html'), path.join('about', 'index.html'), path.join('contact', 'index.html')
];
for (const route of expectedRoutes) if (!files.includes(route)) problems.push(`required public route is missing: ${route}`);
let publicText = '';
for (const file of files.filter(file => /\.(?:html|js|css|json|svg|xml|txt)$/.test(String(file)))) publicText += await fs.readFile(path.join(root, 'dist', file), 'utf8');
if (publicText.includes(wrongExpansion)) problems.push('generated output contains outdated LARI expansion');
if (!publicText.includes(rightExpansion)) problems.push('generated output is missing the authoritative LARI expansion');
if (/\b[A-Z]:\\[^\\\s]+(?:\\[^\\\s]+)+/i.test(publicText)) problems.push('generated text contains an absolute local Windows path');
const glyph = await fs.readFile(path.join(root, 'assets/lari-glyph.svg'));
const glyphHash = crypto.createHash('sha256').update(glyph).digest('hex').toUpperCase();
if (glyphHash !== 'C602C1F1D06F383976196A721F5F5F0A3B5204CBB0819CA87CC069C0E993BE39') problems.push('approved master glyph bytes differ from the inspected v4 source');
const gateway = await fs.readFile(path.join(root, 'assets/gateway2000-crt.svg'));
if (crypto.createHash('sha256').update(gateway).digest('hex').toUpperCase() !== '39C4DCDA48BBCD6A3EF39F35F0EECFDBE45906DB2D8193BB001E4F669C90E3EA') problems.push('copied Gateway shell differs from approved v4 source');
for (const asset of ['lari-primary-light.svg', 'lari-primary-dark.svg', 'lari-app-icon-dark.svg', 'lari-website-hero.svg', 'lari-website-hero.png', 'favicon.ico', 'lari-icon-16.png', 'lari-icon-32.png', 'lari-icon-180.png', 'lari-icon-192.png', 'lari-icon-512.png', 'site.webmanifest', 'brand-tokens.css', 'brand-tokens.json', 'gateway2000-crt.svg', 'crt-sticky-note.svg', 'crt-power-on.mp3', 'dialup-connect.mp3']) {
  try { await fs.access(path.join(root, 'dist', 'assets', asset)); } catch { problems.push(`v4 brand asset is missing from build: ${asset}`); }
}
try {
  const manifest = JSON.parse(await fs.readFile(path.join(root, 'dist/assets/site.webmanifest'), 'utf8'));
  for (const icon of manifest.icons || []) await fs.access(path.join(root, 'dist/assets', icon.src));
  if (manifest.name !== config.brandName || manifest.theme_color.toLowerCase() !== '#050908') problems.push('v4 web manifest identity or theme color is incorrect');
} catch { problems.push('v4 web manifest is invalid or references a missing icon'); }
for (const asset of ['lari-primary-light.svg', 'lari-primary-dark.svg']) {
  const svg = await fs.readFile(path.join(root, 'assets', asset), 'utf8');
  if (!svg.includes(rightExpansion)) problems.push(`${asset} is missing the correct expansion`);
  if (svg.includes(wrongExpansion)) problems.push(`${asset} contains outdated branding`);
}
for (const file of canonicalHtmlFiles) {
  const html = await fs.readFile(path.join(root, 'dist', file), 'utf8');
  if (html.includes(wrongExpansion)) problems.push(`${file} contains outdated LARI expansion`);
  if (!html.includes('<main id="main"') || !html.includes('aria-label="Main navigation"')) problems.push(`${file} is missing semantic landmarks`);
  if (!/<h1\b/.test(html) || !/<title>[^<]+<\/title>/.test(html)) problems.push(`${file} is missing a page heading or title`);
  if (!html.includes('/assets/lari-primary-light.svg') || !html.includes('/assets/lari-primary-dark.svg')) problems.push(`${file} is missing the correct header/footer lockups`);
  if (!html.includes('/assets/favicon.ico') || !html.includes('/assets/site.webmanifest')) problems.push(`${file} is missing the v4 favicon or manifest`);
  if (!html.includes('id="theme-choice"') || !html.includes('data-theme="light"')) problems.push(`${file} is missing the accessible theme preference or early theme bootstrap`);
  if (!/<meta name="description" content="[^"]{50,}"/.test(html) || !/<meta name="robots" content="index,follow"/.test(html)) problems.push(`${file} is missing a useful description or index directive`);
  if (!/<meta property="og:image" content="https:\/\/whatslari\.com\/assets\/social-cards\/[^"]+\.png"/.test(html)) problems.push(`${file} is missing its production PNG social card`);
  if (!html.includes('property="og:image:width" content="1200"') || !html.includes('property="og:image:height" content="630"') || !html.includes('name="twitter:image"')) problems.push(`${file} is missing social-card dimensions or X/Twitter metadata`);
  if (!html.includes('type="application/ld+json"')) problems.push(`${file} is missing JSON-LD structured data`);
  for (const match of html.matchAll(/href="(\/[^"]+)"/g)) {
    const target = match[1].split('#')[0].split('?')[0];
    if (target.startsWith('/assets/') || target.startsWith('/data/')) continue;
    const routePath = target === '/' ? 'index.html' : `${target.replace(/^\//, '').replace(/\/$/, '')}/index.html`;
    try { await fs.access(path.join(root, 'dist', routePath)); } catch { problems.push(`${file} links to missing route ${target}`); }
  }
}
const socialCards = (await fs.readdir(path.join(root, 'dist/assets/social-cards'))).filter(name => name.endsWith('.png'));
const requiredCards = ['home.png', 'how-it-works.png', 'live.png', 'experiments.png', 'research.png', 'research-methods.png', 'methods.png', 'capabilities.png', 'development.png', 'community.png', 'request-experiment.png', 'evidence-guide.png', 'about.png'];
for (const card of requiredCards) if (!socialCards.includes(card)) problems.push(`required social card is missing: ${card}`);
for (const card of socialCards) {
  const bytes = await fs.readFile(path.join(root, 'dist/assets/social-cards', card));
  if (bytes.toString('hex', 0, 8) !== '89504e470d0a1a0a' || bytes.readUInt32BE(16) !== 1200 || bytes.readUInt32BE(20) !== 630) problems.push(`social card must be 1200x630 PNG: ${card}`);
}
const sitemap = await fs.readFile(path.join(root, 'dist/sitemap.xml'), 'utf8');
const sitemapLocations = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(match => match[1]);
if (sitemapLocations.length !== canonicalHtmlFiles.length || new Set(sitemapLocations).size !== sitemapLocations.length) problems.push('sitemap must list every canonical route exactly once');
if (sitemapLocations.some(location => !location.startsWith(`${config.domain}/`) || location.includes('?'))) problems.push('sitemap contains a noncanonical or nonproduction URL');
if ([...sitemap.matchAll(/<url>/g)].length !== [...sitemap.matchAll(/<lastmod>\d{4}-\d{2}-\d{2}<\/lastmod>/g)].length) problems.push('sitemap lastmod values are missing or malformed');
const robots = await fs.readFile(path.join(root, 'dist/robots.txt'), 'utf8');
if (!robots.includes('User-agent: *') || !robots.includes(`Sitemap: ${config.domain}/sitemap.xml`)) problems.push('robots.txt is missing public crawling or the production sitemap');
for (const privateMarker of ['privateSourceRecordRef', 'activeModelSha256', 'proofArtifactSha256', 'candidate-records.json', 'private-review/']) if (publicText.includes(privateMarker)) problems.push(`generated site contains private review material: ${privateMarker}`);
for (const route of ['experiments', 'capabilities', 'development']) { try { const html = await fs.readFile(path.join(root, 'dist', route, 'index.html'), 'utf8'); if (!html.includes('noindex,follow') || !html.includes('location.replace(')) problems.push(`legacy /${route}/ route is not a redirect`); } catch { problems.push(`legacy /${route}/ route is missing`); } }
if (problems.length) {
  process.stderr.write(`Site checks failed:\n- ${problems.join('\n- ')}\n`);
  process.exitCode = 1;
} else process.stdout.write(`Checks passed: ${htmlFiles.length} routes, approved-data schema, safety scan, terminology, landmarks, internal links.\n`);
