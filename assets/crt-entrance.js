import { CrtStateMachine, CRT_STATES, CRT_TIMINGS } from './crt-state-machine.js';

const stateClasses = Object.values(CRT_STATES).map(state => `state-${state.toLowerCase().replaceAll('_', '-')}`);
const isTypingState = state => [CRT_STATES.MODEM_CONNECTING, CRT_STATES.MODEM_NEGOTIATING, CRT_STATES.IDENTITY_REVEAL, CRT_STATES.CONNECTION_ESTABLISHED].includes(state);

export function mountCrtEntrance() {
  const entrance = document.querySelector('#crt-entrance');
  if (!entrance) return () => {};

  const main = document.querySelector('#main');
  const params = new URLSearchParams(location.search);
  const replay = params.get('intro') === 'replay';
  const seen = (() => { try { return localStorage.getItem('lari-intro-complete') === '1'; } catch { return false; } })();
  if (!replay && seen) return () => {};
  if (replay) { try { localStorage.removeItem('lari-intro-complete'); } catch {} }

  const wordmark = entrance.querySelector('#crt-wordmark');
  const expansion1 = entrance.querySelector('#crt-expansion-1');
  const expansion2 = entrance.querySelector('#crt-expansion-2');
  const tagline1 = entrance.querySelector('#crt-tagline-1');
  const tagline2 = entrance.querySelector('#crt-tagline-2');
  const connectionStatus = entrance.querySelector('#crt-connection-status');
  const prompt = entrance.querySelector('#crt-prompt');
  const liveStatus = entrance.querySelector('#crt-status');
  const physicalPower = entrance.querySelector('#crt-physical-power');
  const screenPower = entrance.querySelector('#crt-screen-power');
  const stickyPower = entrance.querySelector('#crt-sticky-target');
  const enterPrompt = entrance.querySelector('#crt-enter-hotspot');
  const skip = entrance.querySelector('#crt-skip');
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const reducedTimings = reducedMotion
    ? { powerPress: 0, tubeWarmup: 520, modemDelay: 1230, readyAfterConnection: 0, enter: 0 }
    : {};
  const timings = { ...CRT_TIMINGS, ...(window.LARI_CRT_TIMINGS || {}), ...reducedTimings };
  let timerGeneration = 0;
  let identityStarted = false;
  const pendingTimers = new Set();
  const makeAudio = (source, volume) => {
    const audio = new Audio(source);
    audio.preload = 'auto';
    audio.volume = volume;
    audio.load();
    return audio;
  };
  const powerAudio = makeAudio('/assets/crt-power-on.mp3', 0.19);
  const modemAudio = makeAudio('/assets/dialup-connect.mp3', 0.75);

  const cancelAll = () => {
    timerGeneration += 1;
    for (const timer of pendingTimers) clearTimeout(timer);
    pendingTimers.clear();
  };
  const schedule = (callback, delay) => {
    const generation = timerGeneration;
    const timer = setTimeout(() => {
      pendingTimers.delete(timer);
      if (generation === timerGeneration) callback();
    }, Math.max(0, delay));
    pendingTimers.add(timer);
    return timer;
  };
  const stopAudio = () => {
    for (const audio of [powerAudio, modemAudio]) {
      audio.pause();
      try { audio.currentTime = 0; } catch {}
    }
  };
  const playAudio = audio => {
    try {
      audio.currentTime = 0;
      const playback = audio.play();
      playback?.catch(() => {
        if (machine.state === CRT_STATES.DONE || machine.state === CRT_STATES.SKIPPED) return;
        liveStatus.textContent = 'Sound is unavailable. The visual startup continues.';
      });
    } catch {
      // Audio is an optional layer; the cue timeline continues without it.
    }
  };

  function setPrompt() {
    // The ready state now transitions automatically; this legacy hotspot is
    // kept disabled so it cannot intercept a click or keyboard activation.
    enterPrompt.disabled = true;
    enterPrompt.tabIndex = -1;
    enterPrompt.setAttribute('aria-disabled', 'true');
    prompt.setAttribute('aria-hidden', 'true');
  }

  function typeField(element, text, speed, done) {
    if (reducedMotion || speed <= 0) { element.textContent = text; done(); return; }
    let position = 0;
    const tick = () => {
      if (!isTypingState(machine.state)) return;
      position += 1;
      element.textContent = text.slice(0, position);
      if (position >= text.length) done();
      else schedule(tick, speed);
    };
    schedule(tick, speed);
  }

  function typeIdentity() {
    if (identityStarted) return;
    identityStarted = true;
    const fields = [
      [wordmark, 'LARI', timings.wordmarkChar ?? 64],
      [expansion1, 'LOCAL AUTONOMOUS', timings.expansionChar ?? 18],
      [expansion2, 'RECURSIVE INTELLIGENCE', timings.expansionChar ?? 18],
      [tagline1, 'INTELLIGENCE YOU CAN OWN.', timings.taglineChar ?? 14],
      [tagline2, 'LEARNING YOU CAN VERIFY.', timings.taglineChar ?? 14]
    ];
    let index = 0;
    const next = () => {
      if (!isTypingState(machine.state)) return;
      if (index >= fields.length) return;
      const [element, text, speed] = fields[index++];
      typeField(element, text, speed, () => schedule(next, timings.fieldPause ?? 70));
    };
    next();
  }

  function renderState(state) {
    for (const className of stateClasses) entrance.classList.remove(className);
    entrance.classList.add(`state-${state.toLowerCase().replaceAll('_', '-')}`);
    entrance.dataset.state = state;
    physicalPower.disabled = state !== CRT_STATES.OFF;
    screenPower.disabled = state !== CRT_STATES.OFF;
    stickyPower.disabled = state !== CRT_STATES.OFF;
    setPrompt();

    const messages = {
      [CRT_STATES.OFF]: 'Display off. Press the Gateway power button to begin.',
      [CRT_STATES.POWERING_ON]: 'Power button pressed. CRT tube starting.',
      [CRT_STATES.TUBE_IGNITION]: 'CRT tube energizing.',
      [CRT_STATES.INITIALIZING]: 'Tube energizing. Raster stabilizing.',
      [CRT_STATES.MODEM_CONNECTING]: 'Establishing connection.',
      [CRT_STATES.MODEM_NEGOTIATING]: 'Negotiating connection.',
      [CRT_STATES.IDENTITY_REVEAL]: 'LARI identity loading.',
      [CRT_STATES.CONNECTION_ESTABLISHED]: 'Connection established.',
      [CRT_STATES.READY]: 'System ready. Returning to the homepage.',
      [CRT_STATES.ENTERING]: 'Returning to the homepage.',
      [CRT_STATES.SKIPPED]: 'Intro skipped.',
      [CRT_STATES.DONE]: 'Intro complete.'
    };
    liveStatus.textContent = messages[state];
    const connectionMessages = {
      [CRT_STATES.INITIALIZING]: 'INITIALIZING LARI...',
      [CRT_STATES.MODEM_CONNECTING]: 'ESTABLISHING CONNECTION...',
      [CRT_STATES.MODEM_NEGOTIATING]: 'NEGOTIATING...',
      [CRT_STATES.IDENTITY_REVEAL]: 'NEGOTIATING...',
      [CRT_STATES.CONNECTION_ESTABLISHED]: 'CONNECTION ESTABLISHED'
    };
    connectionStatus.textContent = connectionMessages[state] || '';

    if (state === CRT_STATES.OFF) {
      identityStarted = false;
      for (const element of [wordmark, expansion1, expansion2, tagline1, tagline2]) element.textContent = '';
    }
    if (state === CRT_STATES.MODEM_CONNECTING) {
      playAudio(modemAudio);
      typeIdentity();
    }
    if (state === CRT_STATES.READY) machine.enter();
  }

  function finish(reason) {
    cancelAll();
    stopAudio();
    entrance.hidden = true;
    main?.removeAttribute('inert');
    main?.classList.add('crt-page-reveal');
    main?.focus({ preventScroll: true });
    try { localStorage.setItem('lari-intro-complete', '1'); } catch {}
    if (params.has('intro')) history.replaceState(history.state, '', `${location.pathname}${location.hash}`);
    if (reason === 'skip') main?.classList.remove('crt-page-reveal');
  }

  const machine = new CrtStateMachine({ onState: renderState, onFinish: finish, schedule, cancelAll, timings });
  entrance.hidden = false;
  main?.setAttribute('inert', '');
  renderState(CRT_STATES.OFF);
  physicalPower.focus();

  const onPhysicalPower = () => {
    if (!machine.start()) return;
    playAudio(powerAudio);
  };
  const onScreenPower = () => {
    if (!machine.start()) return;
    playAudio(powerAudio);
  };
  const onSkip = event => { event.preventDefault(); machine.skip(); };
  const onKeydown = event => {
    if (event.key === 'Escape' && machine.state !== CRT_STATES.DONE) { machine.skip(); return; }
    if (event.key === 'Tab') {
      const tabbables = [...entrance.querySelectorAll('button:not([disabled]),a[href]')].filter(element => element.tabIndex >= 0);
      if (!tabbables.length) return;
      if (event.shiftKey && document.activeElement === tabbables[0]) { event.preventDefault(); tabbables.at(-1).focus(); }
      else if (!event.shiftKey && document.activeElement === tabbables.at(-1)) { event.preventDefault(); tabbables[0].focus(); }
    }
  };
  const dispose = () => {
    machine.dispose();
    stopAudio();
    physicalPower.removeEventListener('click', onPhysicalPower);
    screenPower.removeEventListener('click', onScreenPower);
    stickyPower.removeEventListener('click', onPhysicalPower);
    skip.removeEventListener('click', onSkip);
    document.removeEventListener('keydown', onKeydown);
    window.removeEventListener('pagehide', dispose);
  };

  physicalPower.addEventListener('click', onPhysicalPower);
  screenPower.addEventListener('click', onScreenPower);
  stickyPower.addEventListener('click', onPhysicalPower);
  skip.addEventListener('click', onSkip);
  document.addEventListener('keydown', onKeydown);
  window.addEventListener('pagehide', dispose, { once: true });
  return dispose;
}
