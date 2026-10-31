import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const temp = await fs.mkdtemp(path.join(os.tmpdir(),'whatslari-populated-build-'));
const forbidden = new Set(['.git','node_modules','dist','private-review']);
const digest = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const record = (id,title,component) => ({
  id,title,summary:'TEST ONLY: a synthetic, isolated record used to exercise the page generator.',
  researchQuestion:'TEST ONLY: does the output include each reviewed field?', researchArea:'Fixture QA', architectureComponent:component,
  whyItMatters:'Test-only fixture; it makes no claim about real LARI behavior.', status:'experimental', verificationStatus:'verified', lifecycleStatus:'candidate',
  sourceRecordId:'Synthetic fixture for automated page generation tests', measuredAt:'2026-10-30T12:00:00.000Z', evaluationMethod:'Automated rendering fixture; not a research result.',
  baseline:'Not applicable to a test fixture.',candidateMethod:'Generator-only test fixture.',comparisonConditions:'Not a model evaluation.',result:'Fixture content appears in the generated detail page.',outcome:'test fixture',
  environment:'Temporary copied website directory.',externalModelUsage:'Not applicable to a generator test.',coldReloadResult:'Not measured.',causalAblationResult:'Not measured.',transferResult:'Not measured.',
  measurements:{fixtureOnly:true, fixtureRows:2},measurementConditions:'Synthetic values for output rendering only.',limitations:'This is test-only synthetic content; it must never be published as research.',
  relatedExperimentIds:[],relationships:[],publicProvenance:'Automated generator fixture only.',reportVersion:'fixture',sourceFingerprint:'a'.repeat(64),publishedAt:'2026-10-31T12:00:00.000Z',lastReviewedAt:'2026-10-31T12:00:00.000Z'
});
try {
  await fs.cp(root,temp,{recursive:true,filter:source => !source.split(path.sep).some(part => forbidden.has(part))});
  const project = temp;
  const snapshot = {
    schemaVersion:2,snapshotId:'snapshot-20261031120000',status:'approved',publishedAt:'2026-10-31T12:00:00.000Z',generatedAt:'2026-10-31T12:00:00.000Z',entryCount:5,
    sourceReport:{version:'test fixture'},previousSnapshotId:null,contentDigest:null,
    experiments:[record('fixture-one','TEST ONLY — Fixture detail one','persistence'),record('fixture-two','TEST ONLY — Fixture detail two','execution')],
    capabilities:[{...record('fixture-capability','TEST ONLY — Capability fixture','kernel'),collection:undefined}],
    milestones:[{...record('fixture-milestone','TEST ONLY — Timeline fixture','state'),collection:undefined}],
    metrics:[{...record('fixture-metric','TEST ONLY — Metric fixture','governance'),collection:undefined}]
  };
  // Public collection rows intentionally omit the staging-only collection field.
  snapshot.capabilities[0].collection = undefined; snapshot.milestones[0].collection = undefined; snapshot.metrics[0].collection = undefined;
  snapshot.contentDigest = digest({ ...snapshot, contentDigest:null });
  await fs.writeFile(path.join(project,'data/approved/snapshot.json'),`${JSON.stringify(snapshot,null,2)}\n`);
  const testConfigPath=path.join(project,'site.config.json');
  const testConfig=JSON.parse(await fs.readFile(testConfigPath,'utf8'));
  testConfig.discussionRepositoryId='R_kgDO_TEST_ONLY'; testConfig.discussionCategory='Announcements'; testConfig.discussionCategoryId='DIC_kwDO_TEST_ONLY';
  await fs.writeFile(testConfigPath,`${JSON.stringify(testConfig,null,2)}\n`);
  const genericCard = path.join(project,'assets/social-cards/experiments.png');
  for (const id of ['fixture-one','fixture-two']) await fs.copyFile(genericCard,path.join(project,`assets/social-cards/experiment-${id}.png`));
  const run = spawnSync(process.execPath,[path.join(project,'tools/build.mjs')],{cwd:project,encoding:'utf8'});
  assert.equal(run.status,0,`isolated populated build succeeds: ${run.stderr || run.stdout}`);
  const dist = path.join(project,'dist');
  const detail = await fs.readFile(path.join(dist,'live/experiments/fixture-one/index.html'),'utf8');
  for (const phrase of ['TEST ONLY — Fixture detail one','Research question','Why this matters','Baseline','Comparison conditions','Measured results','Measurement conditions','Cold reload','Causal ablation','Transfer','Limitations','Public provenance','/how-it-works/#persistence']) assert.ok(detail.includes(phrase),`experiment detail renders ${phrase}`);
  assert.match(detail,/<meta name="robots" content="index,follow"/);
  assert.match(detail,/<link rel="canonical" href="https:\/\/whatslari\.com\/live\/experiments\/fixture-one\/"/);
  assert.match(detail,/<meta property="og:image" content="https:\/\/whatslari\.com\/assets\/social-cards\/experiment-fixture-one\.png"/);
  const detailConfig=detail.match(/<script type="application\/json" data-giscus-config>([\s\S]*?)<\/script>/)?.[1];
  assert.ok(detailConfig,'approved detail declares an embed config for the browser client');
  const detailSettings=JSON.parse(detailConfig);
  assert.equal(detailSettings.repoId,'R_kgDO_TEST_ONLY');
  assert.equal(detailSettings.category,'Announcements');
  assert.equal(detailSettings.categoryId,'DIC_kwDO_TEST_ONLY');
  assert.deepEqual([detailSettings.mapping,detailSettings.strict,detailSettings.reactionsEnabled,detailSettings.emitMetadata,detailSettings.inputPosition,detailSettings.lang,detailSettings.loading],['pathname','1','1','1','top','en','lazy']);
  assert.equal(Object.hasOwn(detailSettings,'backlink'),false,'the canonical backlink comes from the giscus meta tag, not an unsupported script attribute');
  assert.match(detail,/<meta name="giscus:backlink" content="https:\/\/whatslari\.com\/live\/experiments\/fixture-one\/">/);
  const experiments = await fs.readFile(path.join(dist,'live/experiments/index.html'),'utf8');
  for (const field of ['data-filter-from','data-filter-through','data-filter-area','data-filter-component','data-filter-outcome','data-filter-lifecycle']) assert.ok(experiments.includes(field),`experiment explorer exposes ${field}`);
  assert.match(experiments,/data-component="persistence"/);
  assert.equal((experiments.match(/data-giscus-section/g)||[]).length,1,'each canonical page gets one discussion embed');
  const architecture = await fs.readFile(path.join(dist,'how-it-works/index.html'),'utf8');
  assert.match(architecture,/href="\/live\/experiments\/fixture-one\/"/);
  const timeline = await fs.readFile(path.join(dist,'live/timeline/index.html'),'utf8');
  assert.match(timeline,/data-filter-from/);
  assert.match(timeline,/2026/);
  const sitemap = await fs.readFile(path.join(dist,'sitemap.xml'),'utf8');
  assert.match(sitemap,/<loc>https:\/\/whatslari\.com\/live\/experiments\/fixture-one\/\/??<\/loc>|<loc>https:\/\/whatslari\.com\/live\/experiments\/fixture-one\/<\/loc>/);
  const generated = await fs.readdir(dist,{recursive:true});
  const corpus = (await Promise.all(generated.filter(file => /\.(?:html|xml|json|txt)$/.test(String(file))).map(file => fs.readFile(path.join(dist,file),'utf8')))).join('\n');
  assert.ok(!corpus.includes('private-review/'));
  assert.ok(!corpus.includes('D:\\Lari-workspace\\html-agent-swarm'));
  process.stdout.write('Isolated populated timeline, filters, architecture links, detail SEO, and fixture isolation checks passed.\n');
} finally {
  if (process.env.PRESERVE_POPULATED_FIXTURE === '1') process.stdout.write(`Preserved isolated test-only fixture at ${temp}\n`);
  else await fs.rm(temp,{recursive:true,force:true});
}
