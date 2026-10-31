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
        && (!area || area.value === 'all' || record.dataset.area === area.value)
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
