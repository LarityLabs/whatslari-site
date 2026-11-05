import { mountCrtEntrance } from './crt-entrance.js';

const root = document.documentElement;
const themeChoice = document.querySelector('#theme-choice');
const themeColor = document.querySelector('meta[name="theme-color"]');
const systemPreference = window.matchMedia?.('(prefers-color-scheme: dark)');
const storedTheme = () => {
  try {
    const saved = localStorage.getItem('lari-theme');
    return ['light', 'dark', 'system'].includes(saved) ? saved : 'system';
  } catch {
    return 'system';
  }
};
let preference = storedTheme();

function applyTheme() {
  const effective = preference === 'system' ? (systemPreference?.matches ? 'dark' : 'light') : preference;
  root.dataset.theme = effective;
  root.dataset.themePreference = preference;
  if (themeChoice) themeChoice.value = preference;
  if (themeColor) themeColor.content = effective === 'dark' ? '#050908' : '#f3f2ec';
  document.querySelectorAll('iframe.giscus-frame').forEach(syncGiscusFrame);
}

function syncGiscusFrame(frame) {
  const effective = root.dataset.theme === 'dark' ? 'dark' : 'light';
  frame.contentWindow?.postMessage({ giscus: { setConfig: { theme: effective } } }, 'https://giscus.app');
}

function setGiscusError(section) {
  const state = section.querySelector('[data-giscus-state]');
  const error = section.querySelector('[data-giscus-error]');
  if (state) state.hidden = true;
  if (error) error.hidden = false;
}

const giscusTimeouts = new WeakMap();

function bindGiscusFrame(frame) {
  syncGiscusFrame(frame);
  if (frame.dataset.lariGiscusBound) return;
  frame.dataset.lariGiscusBound = 'true';
  frame.addEventListener('load', () => {
    const section = frame.closest('[data-giscus-section]');
    frame.dataset.lariGiscusLoaded = 'true';
    const timeout = giscusTimeouts.get(section);
    if (timeout) window.clearTimeout(timeout);
    const state = section?.querySelector('[data-giscus-state]');
    if (state) state.hidden = true;
  }, { once: true });
}

window.addEventListener('message', event => {
  if (event.origin !== 'https://giscus.app' || !event.data || typeof event.data !== 'object' || !event.data.giscus) return;
  const section = [...document.querySelectorAll('[data-giscus-section]')].find(item => item.querySelector('iframe.giscus-frame')?.contentWindow === event.source);
  if (!section) return;
  const message = event.data.giscus;
  if (message.error) {
    setGiscusError(section);
    return;
  }
  if (!message.discussion) return;
  const comments = Number(message.discussion.totalCommentCount);
  const reactions = Number(message.discussion.reactionCount);
  if (!Number.isFinite(comments) || !Number.isFinite(reactions) || comments < 0 || reactions < 0) return;
  const metadata = section.querySelector('[data-giscus-metadata]');
  if (metadata) {
    const format = value => new Intl.NumberFormat('en').format(value);
    metadata.textContent = `${format(comments)} ${comments === 1 ? 'comment' : 'comments'} · ${format(reactions)} ${reactions === 1 ? 'reaction' : 'reactions'}`;
    metadata.hidden = false;
  }
  const state = section.querySelector('[data-giscus-state]');
  if (state) state.hidden = true;
});

themeChoice?.addEventListener('change', () => {
  preference = themeChoice.value;
  try { localStorage.setItem('lari-theme', preference); } catch { /* Theme still works for this page. */ }
  applyTheme();
});
systemPreference?.addEventListener?.('change', () => {
  if (preference === 'system') applyTheme();
});
new MutationObserver(records => {
  for (const record of records) {
    for (const node of record.addedNodes) {
      if (!(node instanceof Element)) continue;
      if (node.matches('iframe.giscus-frame')) bindGiscusFrame(node);
      node.querySelectorAll?.('iframe.giscus-frame').forEach(bindGiscusFrame);
    }
  }
}).observe(document.documentElement, { childList: true, subtree: true });
window.addEventListener('storage', event => {
  if (event.key === 'lari-theme') {
    preference = storedTheme();
    applyTheme();
  }
});
applyTheme();

for (const section of document.querySelectorAll('[data-giscus-section]')) {
  const configElement = section.querySelector('[data-giscus-config]');
  if (!configElement) continue;
  try {
    const settings = JSON.parse(configElement.textContent);
    const script = document.createElement('script');
    script.src = 'https://giscus.app/client.js';
    script.async = true;
    script.crossOrigin = 'anonymous';
    for (const [name, value] of Object.entries(settings)) {
      const attribute = name.replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`);
      script.setAttribute(`data-${attribute}`, String(value));
    }
    script.setAttribute('data-theme', root.dataset.theme === 'dark' ? 'dark' : 'light');
    script.addEventListener('error', () => setGiscusError(section), { once: true });
    const startLoadTimeout = () => giscusTimeouts.set(section, window.setTimeout(() => {
      if (!section.querySelector('iframe.giscus-frame[data-lari-giscus-loaded="true"]')) setGiscusError(section);
    }, 20000));
    if ('IntersectionObserver' in window) {
      const observer = new IntersectionObserver(entries => {
        if (!entries.some(entry => entry.isIntersecting)) return;
        observer.disconnect();
        startLoadTimeout();
      }, { rootMargin: '500px' });
      observer.observe(section);
    } else startLoadTimeout();
    configElement.after(script);
  } catch {
    setGiscusError(section);
  }
}

const menuButton = document.querySelector('.menu-toggle');
const menu = document.querySelector('#mobile-nav');
menuButton?.addEventListener('click', () => {
  const open = menuButton.getAttribute('aria-expanded') === 'true';
  menuButton.setAttribute('aria-expanded', String(!open));
  if (menu) menu.hidden = open;
});

const explorer = document.querySelector('[data-record-explorer]');
if (explorer) {
  const search = explorer.querySelector('[data-filter-search]');
  const status = explorer.querySelector('[data-filter-status]');
  const area = explorer.querySelector('[data-filter-area]');
  const component = explorer.querySelector('[data-filter-component]');
  const outcome = explorer.querySelector('[data-filter-outcome]');
  const lifecycle = explorer.querySelector('[data-filter-lifecycle]');
  const from = explorer.querySelector('[data-filter-from]');
  const through = explorer.querySelector('[data-filter-through]');
  const resultCount = explorer.querySelector('[data-filter-count]');
  const records = [...explorer.querySelectorAll('[data-record]')];
  const update = () => {
    const query = search?.value.trim().toLocaleLowerCase() || '';
    const selectedStatus = status?.value || 'all';
    let visible = 0;
    for (const record of records) {
      const matches = (selectedStatus === 'all' || record.dataset.status === selectedStatus)
        && (!query || record.dataset.search.includes(query))
        && (!area || area.value === 'all' || (record.dataset.areas || record.dataset.area || '').split('|').includes(area.value))
        && (!component || component.value === 'all' || record.dataset.component === component.value)
        && (!outcome || outcome.value === 'all' || record.dataset.outcome === outcome.value)
        && (!lifecycle || lifecycle.value === 'all' || record.dataset.lifecycle === lifecycle.value)
        && (!from?.value || record.dataset.date >= from.value)
        && (!through?.value || record.dataset.date <= through.value);
      record.hidden = !matches;
      if (matches) visible++;
    }
    if (resultCount) resultCount.textContent = `${visible} ${visible === 1 ? 'record' : 'records'} shown`;
  };
  search?.addEventListener('input', update);
  for (const control of [status, area, component, outcome, lifecycle, from, through]) control?.addEventListener('change', update);
}

const activity = document.querySelector('[data-live-activity]');
if (activity) {
  if (!document.querySelector('link[href="/assets/activity.css"]')) {
    const stylesheet = document.createElement('link');
    stylesheet.rel = 'stylesheet';
    stylesheet.href = '/assets/activity.css';
    document.head.append(stylesheet);
  }
  const activityList = activity.querySelector('[data-activity-list]');
  const activityState = activity.querySelector('[data-activity-state]');
  const activityArea = activity.querySelector('[data-activity-area]');
  const refreshButton = activity.querySelector('[data-activity-refresh]');
  const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)');
  let currentSnapshotId = '';
  let currentDigest = '';
  let records = [...activityList.querySelectorAll('[data-activity-card]')].map(card => ({ id: card.dataset.sourceId }));
  currentSnapshotId = activity.dataset.snapshotId || '';
  currentDigest = activity.dataset.contentDigest || '';
  const safeText = value => typeof value === 'string' ? value : '';
  const makeActivityCard = row => {
    const li = document.createElement('li');
    li.className = 'activity-card';
    li.dataset.activityCard = '';
    li.dataset.areas = [...new Set([...(Array.isArray(row.researchAreas) ? row.researchAreas : []), row.researchArea].filter(Boolean))].join('|');
    li.dataset.sourceId = safeText(row.id);
    const eyebrow = document.createElement('p');
    eyebrow.className = 'eyebrow';
    eyebrow.textContent = `${row.activityKind} · ${safeText(row.status)} · ${safeText(row.verificationStatus)}`;
    li.append(eyebrow);
    const title = document.createElement('h3');
    const link = document.createElement('a');
    link.href = row.activityHref;
    link.textContent = `${safeText(row.title)} ↗`;
    title.append(link);
    li.append(title);
    const summary = document.createElement('p');
    summary.textContent = safeText(row.summary);
    li.append(summary);
    const detail = document.createElement('details');
    const summaryToggle = document.createElement('summary');
    summaryToggle.textContent = 'Record details';
    detail.append(summaryToggle);
    if (row.result) { const observed = document.createElement('p'); observed.textContent = `Observed: ${row.result}`; detail.append(observed); }
    if (row.outcome) { const outcome = document.createElement('p'); outcome.textContent = `Outcome: ${row.outcome}`; detail.append(outcome); }
    const limitations = document.createElement('p');
    limitations.textContent = `Limitations: ${safeText(row.limitations) || 'Not stated in this approved record.'}`;
    detail.append(limitations);
    const dates = document.createElement('small');
    dates.textContent = `Measured ${safeText(row.measuredAt) || 'date unavailable'} · Published ${safeText(row.publishedAt) || 'date unavailable'}`;
    detail.append(dates);
    li.append(detail);
    const published = document.createElement('time');
    published.dateTime = safeText(row.publishedAt);
    published.textContent = `Published ${row.publishedLabel}`;
    li.append(published);
    return li;
  };
  const renderActivity = (snapshot, animateIds = new Set()) => {
    const items = [
      ...snapshot.experiments.map(row => ({ ...row, activityKind: 'Research record published', activityHref: `/live/experiments/${encodeURIComponent(row.id)}/` })),
    ].sort((a,b) => String(b.publishedAt || '').localeCompare(String(a.publishedAt || '')) || String(b.measuredAt || '').localeCompare(String(a.measuredAt || ''))).slice(0, 12);
    records = items;
    const fragment = document.createDocumentFragment();
    for (const row of items) {
      const card = makeActivityCard({ ...row, publishedLabel: row.publishedAt ? new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(row.publishedAt)) : 'date unavailable' });
      if (animateIds.has(row.id) && !reducedMotion?.matches) card.classList.add('activity-new');
      fragment.append(card);
    }
    activityList.replaceChildren(fragment);
    if (items.length === 0) {
      const empty = document.createElement('li');
      empty.className = 'empty-state';
      empty.textContent = 'No approved research activity is available in this snapshot.';
      activityList.append(empty);
    }
    if (activityArea) {
      const selected = activityArea.value;
      const areas = [...new Set(items.flatMap(item => [...(Array.isArray(item.researchAreas) ? item.researchAreas : []), item.researchArea].filter(Boolean)))].sort();
      activityArea.replaceChildren(new Option('All areas', 'all'), ...areas.map(areaName => new Option(areaName, areaName)));
      activityArea.value = areas.includes(selected) ? selected : 'all';
      for (const card of activityList.querySelectorAll('[data-activity-card]')) card.hidden = activityArea.value !== 'all' && !card.dataset.areas.split('|').includes(activityArea.value);
    }
  };
  const verifySnapshot = async (snapshot, manifest) => {
    if (!snapshot || snapshot.snapshotId !== manifest.snapshotId || snapshot.contentDigest !== manifest.contentDigest
      || !Array.isArray(snapshot.experiments) || !Array.isArray(snapshot.milestones)) throw new Error('Snapshot identity does not match its manifest.');
    if (!window.crypto?.subtle) throw new Error('This browser cannot verify the approved snapshot digest.');
    const payload = { ...snapshot, contentDigest: null };
    const digest = [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(payload))))].map(byte => byte.toString(16).padStart(2, '0')).join('');
    if (digest !== snapshot.contentDigest) throw new Error('Approved snapshot digest verification failed.');
  };
  const checkForActivity = async () => {
    if (activityState) activityState.textContent = 'Checking the approved snapshot…';
    try {
      const manifestResponse = await fetch(`${activity.dataset.manifest}?_=${Date.now()}`, { cache: 'no-store' });
      if (!manifestResponse.ok) throw new Error(`Manifest request returned ${manifestResponse.status}.`);
      const manifest = await manifestResponse.json();
      if (manifest.schemaVersion !== 1 || !manifest.snapshotUrl || !manifest.snapshotId || !manifest.contentDigest) throw new Error('The public manifest is incomplete.');
      if (manifest.snapshotId === currentSnapshotId && manifest.contentDigest === currentDigest) {
        if (activityState) activityState.textContent = `No new approved records. Snapshot published ${manifest.publishedAt ? new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' }).format(new Date(manifest.publishedAt)) : 'at an unknown time'} UTC.`;
        return;
      }
      const response = await fetch(`${manifest.snapshotUrl}?_=${Date.now()}`, { cache: 'no-store' });
      if (!response.ok) throw new Error(`Snapshot request returned ${response.status}.`);
      const nextSnapshot = await response.json();
      await verifySnapshot(nextSnapshot, manifest);
      const priorIds = new Set(records.map(row => row.id));
      const newIds = new Set([...nextSnapshot.experiments, ...nextSnapshot.milestones].filter(row => !priorIds.has(row.id)).map(row => row.id));
      currentSnapshotId = manifest.snapshotId;
      currentDigest = manifest.contentDigest;
      renderActivity(nextSnapshot, newIds);
      activity.closest('[data-live-observatory]')?.dispatchEvent(new CustomEvent('live-snapshot-updated', { detail: nextSnapshot }));
      if (activityState) activityState.textContent = `Updated from approved snapshot ${manifest.snapshotId}. Published ${manifest.publishedAt ? new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' }).format(new Date(manifest.publishedAt)) : 'at an unknown time'} UTC.`;
    } catch (error) {
      if (activityState) activityState.textContent = `Showing the last built approved snapshot; update check unavailable (${error.message}).`;
    }
  };
  activityArea?.addEventListener('change', () => {
    for (const card of activityList.querySelectorAll('[data-activity-card]')) card.hidden = activityArea.value !== 'all' && !card.dataset.areas.split('|').includes(activityArea.value);
  });
  refreshButton?.addEventListener('click', checkForActivity);
  window.addEventListener('online', checkForActivity);
  window.addEventListener('offline', () => { if (activityState) activityState.textContent = 'Offline. Showing the last built approved snapshot.'; });
  checkForActivity();
  window.setInterval(checkForActivity, 60_000);
}

const requestForm = document.querySelector('[data-request-form]');
if (requestForm) {
  const review = document.querySelector('[data-request-review]');
  const preview = document.querySelector('[data-request-preview]');
  const status = document.querySelector('[data-request-status]');
  const values = () => Object.fromEntries(new FormData(requestForm).entries());
  const markdown = data => [
    `## ${data.title.trim()}`,
    `### Research question\n${data.question.trim()}`,
    `### Hypothesis\n${data.hypothesis.trim()}`,
    `### Proposed test\n${data.test.trim()}`,
    `### Expected results\n${data.expected.trim()}`,
    `### Success and failure criteria\n${data.criteria.trim()}`,
    `### Relevant context\n${data.context.trim() || 'Not provided.'}`
  ].join('\n\n');
  requestForm.addEventListener('submit', event => {
    event.preventDefault();
    if (!requestForm.reportValidity()) return;
    preview.textContent = markdown(values());
    review.hidden = false;
    review.scrollIntoView({ behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
    status.textContent = 'Review the complete draft. Copy it before continuing to GitHub; no Discussion has been submitted.';
  });
  document.querySelector('[data-copy-request]')?.addEventListener('click', async () => {
    const text = preview.textContent;
    try {
      await navigator.clipboard.writeText(text);
      status.textContent = 'Proposal copied. GitHub has not received it; paste it into a new Discussion.';
    } catch {
      const selection = document.createElement('textarea');
      selection.value = text;
      selection.setAttribute('readonly', '');
      selection.className = 'copy-fallback';
      document.body.append(selection);
      selection.select();
      const copied = document.execCommand('copy');
      selection.remove();
      status.textContent = copied ? 'Proposal copied. GitHub has not received it; paste it into a new Discussion.' : 'Copy was blocked. Select the proposal text and copy it manually.';
    }
  });
  document.querySelector('[data-edit-request]')?.addEventListener('click', () => {
    review.hidden = true;
    requestForm.querySelector('[name="title"]')?.focus();
  });
}

mountCrtEntrance();
