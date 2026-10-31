export const CRT_STATES = Object.freeze({
  OFF: 'OFF',
  POWERING_ON: 'POWERING_ON',
  TUBE_IGNITION: 'TUBE_IGNITION',
  INITIALIZING: 'INITIALIZING',
  MODEM_CONNECTING: 'MODEM_CONNECTING',
  MODEM_NEGOTIATING: 'MODEM_NEGOTIATING',
  IDENTITY_REVEAL: 'IDENTITY_REVEAL',
  CONNECTION_ESTABLISHED: 'CONNECTION_ESTABLISHED',
  READY: 'READY',
  ENTERING: 'ENTERING',
  SKIPPED: 'SKIPPED',
  DONE: 'DONE'
});

// Cue points were measured against the copied source MP3s with ffprobe/ffmpeg.
// The 3.40s tube recording starts with the button/tube sound; dial-up lasts 4.00s.
export const CRT_TIMINGS = Object.freeze({
  powerPress: 85,
  tubeWarmup: 1120,
  modemDelay: 725,
  modemDuration: 4000,
  negotiatingAfter: 1650,
  identityAfter: 2200,
  readyAfterConnection: 0,
  enter: 480
});

function cueTimeline(timings) {
  const initialization = timings.powerPress + timings.tubeWarmup;
  const modemStart = initialization + timings.modemDelay;
  const established = modemStart + timings.modemDuration;
  return [
    [timings.powerPress, CRT_STATES.TUBE_IGNITION],
    [initialization, CRT_STATES.INITIALIZING],
    [modemStart, CRT_STATES.MODEM_CONNECTING],
    [modemStart + timings.negotiatingAfter, CRT_STATES.MODEM_NEGOTIATING],
    [modemStart + timings.identityAfter, CRT_STATES.IDENTITY_REVEAL],
    [established, CRT_STATES.CONNECTION_ESTABLISHED],
    [established + timings.readyAfterConnection, CRT_STATES.READY]
  ];
}

export class CrtStateMachine {
  constructor({ onState = () => {}, onFinish = () => {}, schedule = setTimeout, cancelAll = () => {}, timings = CRT_TIMINGS } = {}) {
    this.state = CRT_STATES.OFF;
    this.onState = onState;
    this.onFinish = onFinish;
    this.schedule = schedule;
    this.cancelAll = cancelAll;
    this.timings = { ...CRT_TIMINGS, ...timings };
    this.disposed = false;
    this.cues = [];
    this.elapsed = 0;
  }

  #setState(state) {
    if (this.disposed) return false;
    this.state = state;
    this.onState(state);
    return true;
  }

  #scheduleNextCue() {
    if (!this.cues.length || this.disposed) return;
    const [at, state] = this.cues.shift();
    const delay = Math.max(0, at - this.elapsed);
    this.elapsed = at;
    this.schedule(() => {
      if (this.state === CRT_STATES.SKIPPED || this.state === CRT_STATES.DONE) return;
      this.#setState(state);
      if (state === CRT_STATES.READY) {
        this.enter();
        return;
      }
      this.#scheduleNextCue();
    }, delay);
  }

  start() {
    if (this.disposed || this.state !== CRT_STATES.OFF) return false;
    this.elapsed = 0;
    this.cues = cueTimeline(this.timings);
    this.#setState(CRT_STATES.POWERING_ON);
    this.#scheduleNextCue();
    return true;
  }

  enter() {
    if (this.disposed || this.state !== CRT_STATES.READY) return false;
    this.cues = [];
    this.cancelAll();
    this.#setState(CRT_STATES.ENTERING);
    this.schedule(() => {
      if (this.state !== CRT_STATES.ENTERING) return;
      this.#setState(CRT_STATES.DONE);
      this.onFinish('enter');
    }, this.timings.enter);
    return true;
  }

  skip() {
    if (this.disposed || this.state === CRT_STATES.DONE || this.state === CRT_STATES.SKIPPED) return false;
    this.cancelAll();
    this.cues = [];
    this.#setState(CRT_STATES.SKIPPED);
    this.onFinish('skip');
    return true;
  }

  replay() {
    if (this.disposed) return false;
    this.cancelAll();
    this.cues = [];
    this.elapsed = 0;
    this.state = CRT_STATES.OFF;
    this.onState(CRT_STATES.OFF);
    return true;
  }

  dispose() {
    if (this.disposed) return;
    this.cancelAll();
    this.cues = [];
    this.disposed = true;
  }
}
