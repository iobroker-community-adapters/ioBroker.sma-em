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
    it('writes a batch in parallel with independent snapshots and original timestamps', async () => {
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

    it('coalesces waiting values, bounds the queue and waits for every old write', async () => {
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
        await tick();
        assert.equal(writes.length, 2);
        firstB.resolve();
        await finished;
        assert.deepEqual(writes.map(({ id, val, ts }) => [id, val, ts]), [['a', 1, 1000], ['b', 1, 1000], ['a', 100, 100000], ['b', 100, 100000]]);
        assert.equal(publisher.getStats().queuedStates, 0);
        assert.equal(publisher.getStats().maxActiveStates, 2);
    });

    it('catches synchronous throws and rejected writes and continues with a newer batch', async () => {
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
        assert.equal(errors.length, 1);
        fail = false;
        await publisher.enqueue([update('a', 2, 2000), update('b', 2, 2000)]);
        assert.deepEqual(written.map(value => value.val), [2, 2]);
        assert.equal(publisher.getStats().writtenValues, 2);
    });

    it('keeps delayed timestamps truthful and rate limits slow/coalescing warnings', async () => {
        let now = 1000;
        const warnings = [];
        const gate = deferred();
        let writes = 0;
        const publisher = new StatePublisher({ writeState() { writes++; if (writes === 1) { return gate.promise; } },
            now: () => now, slowMs: 2000, warningIntervalMs: 30000, onWarning: message => warnings.push(message) });
        const finished = publisher.enqueue([update('a', 1, 1000)]);
        await tick();
        now = 4000;
        void publisher.enqueue([update('a', 2, 2000)]);
        void publisher.enqueue([update('a', 3, 3000)]);
        assert.equal(warnings.length, 1);
        assert.match(warnings[0], /coalesced=1/);
        assert.match(warnings[0], /states=a/);
        gate.resolve();
        await finished;
        assert.equal(warnings.length, 1);
        assert.equal(publisher.getStats().maxDelayMs, 3000);
        now = 35000;
        await publisher.enqueue([update('a', 4, 1000)]);
        assert.equal(warnings.length, 2);
        assert.match(warnings[1], /maxReceiveToCompletionMs=34000/);
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
