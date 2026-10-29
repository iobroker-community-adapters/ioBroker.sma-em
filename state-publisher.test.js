'use strict';

const assert = require('node:assert/strict');
const { describe, it } = typeof global.describe === 'function' ? global : require('node:test');
const { StatePublisher } = require('./lib/state-publisher');

function deferred() {
    let resolve;
    let reject;
    const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
    return { promise, resolve, reject };
}
const update = (id, val, ts = 1000) => ({ id, state: { val, ack: true, ts } });
const tick = async () => { await Promise.resolve(); await Promise.resolve(); };

describe('StatePublisher', () => {
    it('writes independent states in parallel with detached snapshots and original timestamps', async () => {
        const gates = [deferred(), deferred()];
        const writes = [];
        const publisher = new StatePublisher({ writeState(id, state) {
            writes.push({ id, state });
            return gates[writes.length - 1].promise;
        }, now: () => 1100 });
        const snapshots = [update('a', 1), update('b', 2)];
        const finished = publisher.enqueue(snapshots);
        snapshots[0].state.val = 999;
        snapshots[0].state.ts = 9999;
        await tick();
        assert.equal(writes.length, 2);
        assert.deepEqual(writes.map(write => write.state), [{ val: 1, ack: true, ts: 1000 }, { val: 2, ack: true, ts: 1000 }]);
        assert.equal(publisher.getStats().activeStates, 2);
        gates.forEach(gate => gate.resolve());
        await finished;
        assert.equal(publisher.getStats().writtenValues, 2);
        assert.equal(publisher.getStats().maxDelayMs, 100);
    });

    it("coalesces waiting values and waits only for the same state's old write", async () => {
        const firstA = deferred();
        const firstB = deferred();
        const writes = [];
        const publisher = new StatePublisher({ writeState(id, state) {
            writes.push({ id, ...state });
            if (writes.length === 1) { return firstA.promise; }
            if (writes.length === 2) { return firstB.promise; }
        }, now: () => 1000 });
        const finished = publisher.enqueue([update('a', 1), update('b', 1)]);
        await tick();
        for (let value = 2; value <= 100; value++) {
            void publisher.enqueue([update('a', value, value * 1000), update('b', value, value * 1000)]);
        }
        assert.equal(publisher.getStats().queuedStates, 2);
        assert.equal(publisher.getStats().activeStates, 2);
        assert.equal(publisher.getStats().coalescedValues, 196);
        firstA.resolve();
        for (let i = 0; i < 12; i++) await Promise.resolve();
        assert.equal(writes.length, 3);
        assert.equal(writes[2].id, 'a');
        firstB.resolve();
        await finished;
        assert.deepEqual(writes.map(({ id, val, ts }) => [id, val, ts]), [['a', 1, 1000], ['b', 1, 1000], ['a', 100, 100000], ['b', 100, 100000]]);
        assert.equal(publisher.getStats().queuedStates, 0);
        assert.equal(publisher.getStats().maxActiveStates, 2);
    });

    it('coalesces identical connection heartbeats silently but preserves latest timestamp', async () => {
        const gate = deferred();
        const writes = [];
        const warnings = [];
        const publisher = new StatePublisher({ writeState(id, state) {
            writes.push({ id, ...state });
            if (writes.length === 1) { return gate.promise; }
        }, now: () => 1500, onWarning: message => warnings.push(message) });
        const finished = publisher.enqueue([update('info.connection', true, 1000)]);
        await tick();
        void publisher.enqueue([update('info.connection', true, 1100)]);
        void publisher.enqueue([update('info.connection', true, 1200)]);
        assert.equal(warnings.length, 0);
        assert.equal(publisher.getStats().coalescedValues, 1);
        gate.resolve();
        await finished;
        assert.equal(writes.at(-1).ts, 1200);
        assert.equal(warnings.length, 0);
    });

    it('debugs a transient queued connection status change', async () => {
        const warnings = [], debug = [];
        const publisher = new StatePublisher({ writeState() {}, now: () => 1500,
            onWarning: message => warnings.push(message), onDebug: message => debug.push(message) });
        const finished = publisher.enqueue([update('info.connection', false, 1000)]);
        void publisher.enqueue([update('info.connection', true, 1100)]);
        await finished;
        assert.equal(warnings.length, 0);
        assert.match(debug[0], /states=info.connection/);
    });

    it('reports isolated slow connection heartbeats only at debug level', async () => {
        const warnings = [];
        const debug = [];
        const publisher = new StatePublisher({ writeState() {}, now: () => 4000,
            onDebug: message => debug.push(message), onWarning: message => warnings.push(message) });
        await publisher.enqueue([update('info.connection', true, 1000)]);
        assert.equal(warnings.length, 0);
        assert.match(debug[0], /slow=1/);
    });

    it('catches synchronous throws and rejected writes and continues with newer measurements', async () => {
        const errors = [];
        let fail = true;
        const written = [];
        const publisher = new StatePublisher({ writeState(id, state) {
            if (fail && id === 'a') { throw new Error('synchronous failure'); }
            if (fail && id === 'b') { return Promise.reject(new Error('async failure')); }
            written.push({ id, ...state });
        }, onError: message => errors.push(message), now: () => 1000 });
        await publisher.enqueue([update('a', 1), update('b', 1)]);
        assert.equal(publisher.getStats().failures, 2);
        assert.equal(errors.length, 2);
        fail = false;
        await publisher.enqueue([update('a', 2, 2000), update('b', 2, 2000)]);
        assert.deepEqual(written.map(value => value.val), [2, 2]);
        assert.equal(publisher.getStats().writtenValues, 2);
    });

    it('debugs transient coalescing, preserves timestamps and warns on severe delay', async () => {
        let now = 1000;
        const warnings = [], debug = [];
        const gate = deferred();
        let writes = 0;
        const publisher = new StatePublisher({ writeState() { writes++; if (writes === 1) { return gate.promise; } },
            now: () => now, slowMs: 2000, warningIntervalMs: 30000, onWarning: message => warnings.push(message), onDebug: message => debug.push(message) });
        const finished = publisher.enqueue([update('a', 1, 1000)]);
        await tick();
        now = 4000;
        void publisher.enqueue([update('a', 2, 2000)]);
        void publisher.enqueue([update('a', 3, 3000)]);
        assert.equal(warnings.length, 0);
        assert.match(debug[0], /coalesced=1/);
        assert.match(debug[0], /states=a/);
        gate.resolve();
        await finished;
        assert.equal(warnings.length, 0);
        assert.equal(publisher.getStats().maxDelayMs, 3000);
        now = 35000;
        await publisher.enqueue([update('a', 4, 1000)]);
        assert.equal(warnings.length, 1);
        assert.match(warnings[0], /maxReceiveToCompletionMs=34000/);
    });

    it('debugs isolated delays without a stale warning after recovery', async () => {
        let now = 4000;
        const warnings = [], debug = [];
        const publisher = new StatePublisher({ writeState() {}, now: () => now,
            onWarning: m => warnings.push(m), onDebug: m => debug.push(m) });
        await publisher.enqueue([update('a', 1, 1000), update('b', 1, 1000)]);
        now = 35000;
        await publisher.enqueue([update('a', 2, now)]);
        assert.equal(warnings.length, 0);
        assert.equal(debug.length, 1);
        assert.match(debug[0], /queued=0, active=0/);
    });

    it('counts repeated slow completions per state and expires old incidents', async () => {
        let now = 4000;
        const warnings = [];
        const publisher = new StatePublisher({ writeState() {}, now: () => now,
            onWarning: m => warnings.push(m) });
        for (let i = 0; i < 3; i++) {
            await publisher.enqueue([update('a', i, now - 3000), update('b', i, now - 3000)]);
            now += 4000;
        }
        assert.equal(warnings.length, 1);
        now += 60000;
        await publisher.enqueue([update('a', 4, now - 3000)]);
        assert.equal(warnings.length, 1);
    });

    it('scales slow and severe thresholds with the configured realtime interval', async () => {
        const warnings = [], debug = [];
        const publisher = new StatePublisher({ writeState() {}, now: () => 40000, updateIntervalMs: 6000,
            onWarning: m => warnings.push(m), onDebug: m => debug.push(m) });
        await publisher.enqueue([update('a', 1, 35000)]);
        assert.equal(debug.length, 0);
        await publisher.enqueue([update('a', 2, 33000)]);
        assert.equal(debug.length, 1);
        assert.equal(warnings.length, 0);
        await publisher.enqueue([update('a', 3, 20000)]);
        assert.equal(warnings.length, 1);
    });

    it('warns about a sustained blocked write even with only identical heartbeats arriving', async () => {
        let now = 1000;
        const gate = deferred(), warnings = [];
        let writes = 0;
        const publisher = new StatePublisher({ writeState() { if (++writes === 1) return gate.promise; },
            now: () => now, onWarning: m => warnings.push(m) });
        const done = publisher.enqueue([update('a', 1, now)]);
        await tick();
        now = 12000;
        void publisher.enqueue([update('info.connection', true, now)]);
        assert.equal(warnings.length, 1);
        assert.match(warnings[0], /oldestOutstandingAgeMs=11000/);
        gate.resolve();
        await done;
        assert.equal(warnings.length, 1);
    });

    it('does not block close and discards queued/new values without dispatching them', async () => {
        const gate = deferred();
        const written = [];
        const publisher = new StatePublisher({ writeState(id, state) { written.push({ id, ...state }); return gate.promise; }, now: () => 1000 });
        const finished = publisher.enqueue([update('a', 1)]);
        await tick();
        void publisher.enqueue([update('a', 2), update('b', 2)]);
        const stats = publisher.close();
        assert.equal(stats.closed, true);
        assert.equal(stats.queuedStates, 0);
        assert.equal(stats.activeStates, 1);
        assert.equal(stats.discardedValues, 2);
        void publisher.enqueue([update('a', 3)]);
        gate.resolve();
        await finished;
        await publisher.idle();
        assert.deepEqual(written.map(write => write.val), [1]);
        assert.equal(publisher.getStats().discardedValues, 3);
    });

    it('closes before the first dispatch without writing and has stable empty drains', async () => {
        let writes = 0;
        const publisher = new StatePublisher({ writeState() { writes++; } });
        const finished = publisher.enqueue([update('a', 1)]);
        publisher.close();
        await finished;
        await publisher.drain();
        assert.equal(writes, 0);
        assert.equal(publisher.getStats().discardedValues, 1);
    });

    it('cannot be broken by a logger throwing and does not expose mutable stats', async () => {
        const publisher = new StatePublisher({ writeState() { throw new Error('write failed'); },
            onError() { throw new Error('logger failed'); }, onWarning() { throw new Error('warning failed'); }, now: () => 10000 });
        await publisher.enqueue([update('a', 1)]);
        const stats = publisher.getStats();
        stats.failures = 0;
        assert.equal(publisher.getStats().failures, 1);
        assert.equal(publisher.getStats().slowValues, 1);
    });

    it('preserves nested values independently of caller and writer mutations', async () => {
        let written;
        const publisher = new StatePublisher({ writeState(id, state) { written = state; state.val.items.push(4); }, now: () => 1000 });
        const snapshot = update('object', { items: [1, 2] });
        const finished = publisher.enqueue([snapshot]);
        snapshot.state.val.items.push(3);
        await finished;
        assert.deepEqual(written.val.items, [1, 2, 4]);
        assert.deepEqual(snapshot.state.val.items, [1, 2, 3]);
    });
});

describe('Independent state publication', () => {
    const settle = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };

    it('publishes both devices while a connection heartbeat remains blocked', async () => {
        const gate = deferred(), writes = [];
        const publisher = new StatePublisher({ now: () => 1000, writeState(id, state) {
            writes.push({ id, ...state });
            if (id === 'info.connection') return gate.promise;
        } });
        const done = publisher.enqueue([update('info.connection', true)]);
        await settle();
        void publisher.enqueue([update('shm.pregard', 100), update('sem.pregard', 200)]);
        await settle();
        try {
            assert.deepEqual(writes.map(x => x.id), ['info.connection', 'shm.pregard', 'sem.pregard']);
            assert.equal(publisher.getStats().activeStates, 1);
        } finally { gate.resolve(); await done; }
    });

    it('lets a fast state advance while another measurement is blocked, preserving per-state order', async () => {
        const gate = deferred(), writes = [];
        const publisher = new StatePublisher({ now: () => 1000, writeState(id, state) {
            writes.push({ id, ...state });
            if (id === 'a' && state.val === 1) return gate.promise;
        } });
        const done = publisher.enqueue([update('a', 1), update('b', 1)]);
        await settle();
        for (let i = 2; i <= 10; i++) {
            void publisher.enqueue([update('a', i), update('b', i)]);
            await settle();
        }
        try {
            assert.deepEqual(writes.filter(x => x.id === 'a').map(x => x.val), [1]);
            assert.deepEqual(writes.filter(x => x.id === 'b').map(x => x.val), [1,2,3,4,5,6,7,8,9,10]);
            assert.equal(publisher.getStats().queuedStates, 1);
        } finally { gate.resolve(); await done; }
        assert.deepEqual(writes.filter(x => x.id === 'a').map(x => x.val), [1, 10]);
    });
});

describe('Per-state publisher lifecycle and diagnostics', () => {
    const settle = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };

    it('bounds all-blocked work to one active and one waiting snapshot per state', async () => {
        const gates = new Map(['a', 'b', 'info.connection'].map(id => [id, deferred()]));
        const writes = [], inFlight = new Set();
        let overlap = false;
        const publisher = new StatePublisher({ now: () => 1000, writeState(id, state) {
            if (inFlight.has(id)) overlap = true;
            inFlight.add(id);
            writes.push({ id, ...state });
            return gates.get(id).promise.finally(() => inFlight.delete(id));
        } });
        const done = publisher.enqueue([...gates.keys()].map(id => update(id, 1, 1000)));
        await settle();
        for (let i = 2; i <= 1000; i++) {
            const shared = publisher.enqueue([...gates.keys()].map(id => update(id, i, i * 1000)));
            assert.equal(shared, done);
        }
        assert.equal(publisher.getStats().activeStates, 3);
        assert.equal(publisher.getStats().queuedStates, 3);
        assert.equal(writes.length, 3);
        for (const gate of gates.values()) gate.resolve();
        await done;
        assert.equal(overlap, false);
        assert.equal(writes.length, 6);
        assert.ok(writes.slice(3).every(x => x.val === 1000 && x.ts === 1000000));
        assert.equal(publisher.getStats().activeStates, 0);
        assert.equal(publisher.getStats().queuedStates, 0);
    });

    it('releases a failed state independently and continues its newest queued measurement', async () => {
        const failed = deferred(), blocked = deferred(), writes = [], errors = [];
        const publisher = new StatePublisher({ now: () => 1000, onError: m => errors.push(m), writeState(id, state) {
            writes.push({ id, ...state });
            if (id === 'a' && state.val === 1) return failed.promise;
            if (id === 'b') return blocked.promise;
        } });
        const done = publisher.enqueue([update('a', 1), update('b', 1)]);
        await settle();
        void publisher.enqueue([update('a', 2), update('a', 3)]);
        failed.reject(new Error('test database failure'));
        await settle();
        try {
            assert.deepEqual(writes.filter(x => x.id === 'a').map(x => x.val), [1, 3]);
            assert.equal(errors.length, 1);
            assert.match(errors[0], /a: Error: test database failure/);
            assert.equal(publisher.getStats().activeStates, 1);
        } finally { blocked.resolve(); await done; }
    });

    it('reserves a state before reentrant enqueue and does not strand completion-time work', async () => {
        const writes = [];
        let publisher;
        publisher = new StatePublisher({ now: () => 1000, writeState(id, state) {
            writes.push({ id, ...state });
            if (state.val === 1) void publisher.enqueue([update(id, 2)]);
            return Promise.resolve().then(() => {
                if (state.val === 2) void publisher.enqueue([update(id, 3)]);
            });
        } });
        await publisher.enqueue([update('a', 1)]);
        assert.deepEqual(writes.map(x => x.val), [1, 2, 3]);
        assert.equal(publisher.getStats().queuedStates, 0);
        assert.equal(publisher.getStats().activeStates, 0);
    });

    it('does not interpret many unrelated slow states as repeated delay of one measurement', async () => {
        const warnings = [], debug = [];
        const publisher = new StatePublisher({ now: () => 4000, writeState() {},
            onWarning: m => warnings.push(m), onDebug: m => debug.push(m) });
        await publisher.enqueue(Array.from({ length: 20 }, (_, i) => update(`state${i}`, i, 1000)));
        assert.equal(warnings.length, 0);
        assert.equal(debug.length, 1);
        assert.match(debug[0], /slow=20/);
    });

    it('close discards waiting states without cancelling in-flight independent writes', async () => {
        const gates = [deferred(), deferred()], writes = [];
        const publisher = new StatePublisher({ now: () => 1000, writeState(id, state) {
            writes.push({ id, ...state });
            return gates[id === 'a' ? 0 : 1].promise;
        } });
        const done = publisher.enqueue([update('a', 1), update('b', 1)]);
        await settle();
        void publisher.enqueue([update('a', 2), update('b', 2), update('c', 2)]);
        assert.equal(publisher.close().discardedValues, 3);
        gates[0].resolve();
        await settle();
        assert.equal(publisher.getStats().activeStates, 1);
        gates[1].resolve();
        await done;
        assert.equal(writes.length, 2);
        assert.equal(publisher.getStats().activeStates, 0);
    });
});

describe('Publication timing diagnostics', () => {
    const settle = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
    const timing = message => JSON.parse(message.split('timing=')[1]);

    it('separates original receipt-to-start wait from monotonic write duration', async () => {
        let wall = 1000, mono = 0, calls = 0;
        const gate = deferred(), messages = [];
        const publisher = new StatePublisher({ now: () => wall, monotonicNow: () => mono,
            onWarning: m => messages.push(m), onDebug: m => messages.push(m),
            getEventLoopDelayMs: () => 125,
            writeState() {
                if (++calls === 1) return gate.promise;
                wall = 4500; mono = 3500;
            } });
        const done = publisher.enqueue([update('a', 1, 1000)]);
        await settle();
        wall = 2000; mono = 1000;
        void publisher.enqueue([update('a', 2, 2000)]);
        wall = 4000; mono = 3000;
        gate.resolve();
        await done;
        const samples = messages.map(timing);
        const first = samples.find(x => x.slowestWrite?.receivedAt === 1000);
        const second = samples.find(x => x.slowestWrite?.receivedAt === 2000);
        assert.deepEqual(first.slowestWrite, { id: 'a', receivedAt: 1000, startedAt: 1000,
            finishedAt: 4000, waitBeforeWriteMs: 0, writeDurationMs: 3000, failed: false });
        assert.deepEqual(second.slowestWrite, { id: 'a', receivedAt: 2000, startedAt: 4000,
            finishedAt: 4500, waitBeforeWriteMs: 2000, writeDurationMs: 500, failed: false });
        assert.equal(first.eventLoopDelayMaxMs, 125);
        assert.equal(publisher.getStats().maxWaitBeforeWriteMs, 2000);
        assert.equal(publisher.getStats().maxWriteDurationMs, 3000);
    });

    it('reports age of an unfinished write without claiming a completed duration', async () => {
        let wall = 1000, mono = 0;
        const gate = deferred(), messages = [];
        const publisher = new StatePublisher({ now: () => wall, monotonicNow: () => mono,
            onWarning: m => messages.push(m), onDebug: m => messages.push(m), writeState() { return gate.promise; } });
        const done = publisher.enqueue([update('a', 1)]);
        await settle();
        wall = 12000; mono = 11000;
        void publisher.enqueue([update('a', 2, wall)]);
        const diagnostic = timing(messages[0]);
        assert.equal(diagnostic.maxInFlightWriteAgeMs, 11000);
        assert.equal(diagnostic.maxWriteDurationMs, null);
        assert.equal(diagnostic.slowestWrite, null);
        gate.resolve();
        await done;
        assert.equal(publisher.writeStarted.size, 0);
    });

    it('uses a monotonic duration even when the wall clock moves backwards', async () => {
        let wall = 1000, mono = 10;
        const publisher = new StatePublisher({ now: () => wall, monotonicNow: () => mono,
            writeState() { wall = -1000; mono = 3010; } });
        await publisher.enqueue([update('a', 1)]);
        assert.equal(publisher.getStats().maxWriteDurationMs, 3000);
        assert.equal(publisher.getStats().maxWaitBeforeWriteMs, 0);
        assert.equal(publisher.getStats().maxDelayMs, 0);
    });

    it('includes failed write timing and clears recent samples after each diagnostic', async () => {
        let wall = 1000, mono = 0;
        const debug = [], errors = [];
        const publisher = new StatePublisher({ now: () => wall, monotonicNow: () => mono,
            onDebug: m => debug.push(m), onError: m => errors.push(m),
            writeState() { wall += 2500; mono += 2500; throw new Error('timed failure'); } });
        await publisher.enqueue([update('a', 1, wall)]);
        await publisher.enqueue([update('b', 1, wall)]);
        assert.equal(errors.length, 2);
        assert.equal(debug.length, 2);
        assert.ok(debug.map(timing).every(x => x.count === 1 && x.slowestWrite.failed && x.maxWriteDurationMs === 2500));
        assert.equal(publisher.writeStarted.size, 0);
    });
});
