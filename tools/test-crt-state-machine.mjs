import assert from 'node:assert/strict';
import { CrtStateMachine, CRT_STATES, CRT_TIMINGS } from '../assets/crt-state-machine.js';

class FakeClock {
  now = 0;
  nextId = 1;
  tasks = new Map();
  schedule = (callback, delay) => { const id = this.nextId++; this.tasks.set(id, { at: this.now + Math.max(0, delay), callback }); return id; };
  cancelAll = () => this.tasks.clear();
  advance(ms) {
    const end = this.now + ms;
    while (true) {
      const next = [...this.tasks.entries()].sort((a, b) => a[1].at - b[1].at || a[0] - b[0])[0];
      if (!next || next[1].at > end) break;
      this.tasks.delete(next[0]); this.now = next[1].at; next[1].callback();
    }
    this.now = end;
  }
}

const clock = new FakeClock();
const states = [];
const finishes = [];
const machine = new CrtStateMachine({ onState: state => states.push(state), onFinish: reason => finishes.push(reason), schedule: clock.schedule, cancelAll: clock.cancelAll });
assert.equal(machine.state, CRT_STATES.OFF);
assert.equal(machine.start(), true);
assert.equal(machine.start(), false, 'repeated power presses must not restart or duplicate audio cues');
assert.equal(CRT_TIMINGS.tubeWarmup, 1120, 'ignition stays on screen long enough for its phosphor and raster effects to read');
assert.deepEqual(states, [CRT_STATES.POWERING_ON]);
clock.advance(CRT_TIMINGS.powerPress - 1);
assert.equal(machine.state, CRT_STATES.POWERING_ON);
assert.equal(machine.enter(), false, 'Enter is unavailable before READY');
clock.advance(1);
assert.equal(machine.state, CRT_STATES.TUBE_IGNITION);
clock.advance(CRT_TIMINGS.tubeWarmup - 1);
assert.equal(machine.state, CRT_STATES.TUBE_IGNITION);
clock.advance(1);
assert.equal(machine.state, CRT_STATES.INITIALIZING);
clock.advance(CRT_TIMINGS.modemDelay - 1);
assert.equal(machine.state, CRT_STATES.INITIALIZING);
clock.advance(1);
assert.equal(machine.state, CRT_STATES.MODEM_CONNECTING);
assert.equal(machine.enter(), false, 'Enter is unavailable while the modem connects');
clock.advance(CRT_TIMINGS.negotiatingAfter);
assert.equal(machine.state, CRT_STATES.MODEM_NEGOTIATING);
clock.advance(CRT_TIMINGS.identityAfter - CRT_TIMINGS.negotiatingAfter);
assert.equal(machine.state, CRT_STATES.IDENTITY_REVEAL);
clock.advance(CRT_TIMINGS.modemDuration - CRT_TIMINGS.identityAfter);
assert.equal(machine.state, CRT_STATES.CONNECTION_ESTABLISHED);
assert.equal(machine.enter(), false, 'Enter remains unavailable until connection settles');
clock.advance(CRT_TIMINGS.readyAfterConnection);
assert.equal(machine.state, CRT_STATES.READY);
assert.equal(machine.enter(), true);
assert.equal(machine.enter(), false, 'repeated Enter presses must not duplicate transitions');
assert.equal(machine.state, CRT_STATES.ENTERING);
clock.advance(CRT_TIMINGS.enter);
assert.equal(machine.state, CRT_STATES.DONE);
assert.deepEqual(finishes, ['enter']);

machine.replay();
assert.equal(machine.state, CRT_STATES.OFF);
assert.equal(machine.start(), true, 'replay must start again from OFF');
clock.advance(90);
assert.equal(machine.replay(), true, 'replay can reset an active sequence');
assert.equal(machine.state, CRT_STATES.OFF);
clock.advance(5000);
assert.equal(machine.state, CRT_STATES.OFF, 'replay must cancel the prior cue timeline');
assert.equal(machine.start(), true);
clock.advance(90);
assert.equal(machine.skip(), true);
assert.equal(machine.state, CRT_STATES.SKIPPED);
assert.deepEqual(finishes, ['enter', 'skip']);
clock.advance(10000);
assert.ok(!states.slice(states.lastIndexOf(CRT_STATES.SKIPPED) + 1).includes(CRT_STATES.READY), 'skip must cancel all pending startup cues');

const reducedClock = new FakeClock();
const reducedStates = [];
const reducedTimings = Object.fromEntries(Object.keys(CRT_TIMINGS).map(key => [key, 0]));
const reduced = new CrtStateMachine({ onState: state => reducedStates.push(state), schedule: reducedClock.schedule, cancelAll: reducedClock.cancelAll, timings: reducedTimings });
reduced.start(); reducedClock.advance(0);
assert.deepEqual(reducedStates, [CRT_STATES.POWERING_ON, CRT_STATES.TUBE_IGNITION, CRT_STATES.INITIALIZING, CRT_STATES.MODEM_CONNECTING, CRT_STATES.MODEM_NEGOTIATING, CRT_STATES.IDENTITY_REVEAL, CRT_STATES.CONNECTION_ESTABLISHED, CRT_STATES.READY], 'reduced-motion cue timeline preserves the ordered states');
assert.equal(reduced.enter(), true);
reducedClock.advance(0);
assert.equal(reduced.state, CRT_STATES.DONE);
reduced.dispose();
assert.equal(reduced.start(), false, 'disposed machines cannot restart');

const disposeClock = new FakeClock();
const disposedStates = [];
const disposed = new CrtStateMachine({ onState: state => disposedStates.push(state), schedule: disposeClock.schedule, cancelAll: disposeClock.cancelAll });
disposed.start(); disposed.dispose(); disposeClock.advance(10000);
assert.deepEqual(disposedStates, [CRT_STATES.POWERING_ON], 'route teardown cancels pending transitions');
process.stdout.write('CRT cue-timeline state-machine tests passed.\n');
