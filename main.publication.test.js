'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { EventEmitter } = require('node:events');
const { describe, it } = typeof global.describe === 'function' ? global : require('node:test');

// Exercise the actual adapter implementation without opening a UDP socket or
// connecting to a production ioBroker installation.
function loadAdapter() {
    const socket = new EventEmitter();
    socket.bind = (_port, callback) => callback();
    socket.addMembership = () => {};
    socket.close = () => socket.emit('close');

    class FakeAdapter extends EventEmitter {
        constructor() {
            super();
            this.namespace = 'sma-em.0';
            this.config = {
                OIP: '192.0.2.10',
                EMIP: '0.0.0.0',
                BIP: '239.12.255.254',
                BPO: 9522,
                rtP: 1,
                nrtP: 30,
                L1: true,
                L2: true,
                L3: true,
                ext: true,
            };
            this.writes = [];
            this.messages = [];
            this.log = Object.fromEntries(['debug', 'info', 'warn', 'error'].map(level => [
                level,
                message => this.messages.push({ level, message: String(message) }),
            ]));
        }

        async setState(...args) {
            this.writes.push(args);
        }

        async getForeignObjectAsync() {
            return { common: { language: 'en' } };
        }
    }

    const moduleStub = { parent: {}, exports: {} };
    const filename = path.join(__dirname, 'main.js');
    const source = fs.readFileSync(filename, 'utf8');
    const context = {
        module: moduleStub,
        exports: moduleStub.exports,
        Buffer,
        console,
        Date,
        setTimeout,
        clearTimeout,
        setImmediate,
        clearImmediate,
        require(name) {
            if (name === '@iobroker/adapter-core') {
                return { Adapter: FakeAdapter };
            }
            if (name === 'node:dgram' || name === 'dgram') {
                return { createSocket: () => socket };
            }
            return name.startsWith('.') ? require(path.resolve(__dirname, name)) : require(name);
        },
    };
    vm.runInNewContext(`${source}\nmodule.exports.__test = { SmaEm, updCache, serNumsActive };`, context, { filename });
    const internals = moduleStub.exports.__test;
    const adapter = new internals.SmaEm();
    adapter.findIPv4IPs = () => [{ name: 'test0', ipaddr: '192.0.2.10' }];
    return { adapter, socket, ...internals };
}

function deferred() {
    let resolve;
    let reject;
    const promise = new Promise((resolvePromise, rejectPromise) => {
        resolve = resolvePromise;
        reject = rejectPromise;
    });
    return { promise, resolve, reject };
}

function point(id, updateType = 'mean', updatePeriod = 1, length = 4, factor = 1) {
    return { id, active: true, updateType, updatePeriod, length, factor };
}

function seedCache(cache, points, device = '123456') {
    for (const descriptor of Object.values(points)) {
        cache.set(`${device}.${descriptor.id}`, {
            updPeriod: descriptor.updatePeriod,
            updCounter: descriptor.updatePeriod,
            updValue: [],
        });
    }
}

function packet(entries, { serial = 123456, tick = 1000 } = {}) {
    const header = Buffer.alloc(28);
    header.write('SMA', 'ascii');
    header.writeUInt16BE(0x6069, 16);
    header.writeUInt16BE(349, 18);
    header.writeUInt32BE(serial, 20);
    header.writeUInt32BE(tick, 24);
    const fields = entries.map(([obis, value, length = 4]) => {
        const field = Buffer.alloc(4 + length);
        field.writeUInt32BE(obis, 0);
        if (length === 8) {
            field.writeBigUInt64BE(BigInt(value), 4);
        } else {
            field.writeUInt32BE(value, 4);
        }
        return field;
    });
    return Buffer.concat([header, ...fields, Buffer.alloc(4)]);
}

function collectPublications(adapter, completion = Promise.resolve()) {
    const publications = [];
    adapter.statePublisher = {
        enqueue(writes) {
            // A copy also detects mutations of the queued batch after enqueue.
            publications.push(JSON.parse(JSON.stringify(writes)));
            return completion;
        },
    };
    return publications;
}

function publishedStates(publications) {
    return publications.flat().map(write => ({ id: write.id, ...write.state }));
}

async function settleMicrotasks() {
    for (let index = 0; index < 10; index++) {
        await Promise.resolve();
    }
}

describe('SMA telegram publication through the actual updatePoints implementation', () => {
    it('assigns one receive timestamp and ACK to total, phase and current values', async () => {
        const { adapter, updCache } = loadAdapter();
        const points = {
            0x00010400: point('pregard'),
            0x00020400: point('psurplus'),
            0x00150400: point('L1.pregard'),
            0x00160400: point('L1.psurplus'),
            0x001f0400: point('L1.amperage', 'mean', 1, 4, 0.001),
            0x00290400: point('L2.pregard'),
            0x002a0400: point('L2.psurplus'),
            0x00330400: point('L2.amperage', 'mean', 1, 4, 0.001),
            0x003d0400: point('L3.pregard'),
            0x003e0400: point('L3.psurplus'),
            0x00470400: point('L3.amperage', 'mean', 1, 4, 0.001),
        };
        seedCache(updCache, points);
        const publications = collectPublications(adapter);
        const receivedAt = 1791470000000;
        await adapter.updatePoints('123456', packet(Object.keys(points).map(obis => [Number(obis), 100])), points, receivedAt);
        const states = publishedStates(publications);
        assert.equal(states.length, 11);
        assert.equal(new Set(states.map(state => state.ts)).size, 1);
        assert.ok(states.every(state => state.ts === receivedAt && state.ack === true));
        assert.equal(states.find(state => state.id === '123456.L3.amperage').val, 0.1);
    });

    it('snapshots and resets mean caches before waiting for an earlier publication', async () => {
        const { adapter, updCache } = loadAdapter();
        const points = { 0x00010400: point('pregard') };
        seedCache(updCache, points);
        const completion = deferred();
        const publications = collectPublications(adapter, completion.promise);
        const first = adapter.updatePoints('123456', packet([[0x00010400, 100]]), points, 1000);
        const second = adapter.updatePoints('123456', packet([[0x00010400, 200]]), points, 2000);
        assert.deepEqual(publishedStates(publications), [
            { id: '123456.pregard', val: 100, ack: true, ts: 1000 },
            { id: '123456.pregard', val: 200, ack: true, ts: 2000 },
        ]);
        assert.equal(updCache.get('123456.pregard').updCounter, 1);
        assert.equal(updCache.get('123456.pregard').updValue.length, 0);
        completion.resolve();
        await Promise.all([first, second]);
    });

    it('preserves consecutive telegram values through the real publisher when writes are delayed', async () => {
        const { adapter, updCache } = loadAdapter();
        const points = {
            0x00010400: point('pregard'),
            0x00020400: point('psurplus'),
        };
        seedCache(updCache, points);
        const firstWrites = deferred();
        const writes = [];
        const receivedAt = Date.now();
        adapter.setState = (id, state) => {
            writes.push({ id, ...state });
            return state.ts === receivedAt ? firstWrites.promise : Promise.resolve();
        };
        const first = adapter.updatePoints('123456', packet([[0x00010400, 100], [0x00020400, 0]]), points, receivedAt);
        await settleMicrotasks();
        assert.equal(writes.length, 2, 'both signal writes start without awaiting either database response');
        const second = adapter.updatePoints('123456', packet([[0x00010400, 200], [0x00020400, 50]]), points, receivedAt + 1000);
        assert.equal(updCache.get('123456.pregard').updValue.length, 0);
        assert.equal(updCache.get('123456.psurplus').updValue.length, 0);
        firstWrites.resolve();
        await Promise.all([first, second]);
        await adapter.statePublisher.idle();
        assert.deepEqual(writes.filter(write => write.id === '123456.pregard').map(write => write.val), [100, 200]);
        assert.deepEqual(writes.filter(write => write.id === '123456.psurplus').map(write => write.val), [0, 50]);
        assert.ok(writes.every(write => write.ack === true));
    });

    it('completes packet parsing while publication is blocked and bounds the waiting values', async () => {
        const { adapter, updCache } = loadAdapter();
        const points = {
            0x00010400: point('pregard'),
            0x00020400: point('psurplus'),
        };
        seedCache(updCache, points);
        const blockedWrites = deferred();
        const writes = [];
        const receivedAt = Date.now();
        adapter.setState = (id, state) => {
            writes.push({ id, ...state });
            return state.ts === receivedAt ? blockedWrites.promise : Promise.resolve();
        };
        let parsingComplete = false;
        const first = adapter.updatePoints('123456', packet([[0x00010400, 100], [0x00020400, 0]]), points, receivedAt)
            .then(() => { parsingComplete = true; });
        try {
            await settleMicrotasks();
            assert.equal(parsingComplete, true, 'packet parsing must finish before blocked writes complete');
            assert.equal(writes.length, 2);
            for (let index = 1; index <= 1000; index++) {
                await adapter.updatePoints('123456', packet([[0x00010400, index], [0x00020400, 20]]), points, receivedAt + index);
            }
            const stats = adapter.statePublisher.getStats();
            assert.equal(stats.activeStates, 2);
            assert.ok(stats.queuedStates <= 2, 'only one latest waiting value per state is retained');
            assert.ok(stats.coalescedValues > 0, 'superseded waiting values are explicitly counted');
            assert.equal(writes.length, 2, 'later packets do not create concurrent writes to an active state');
        } finally {
            blockedWrites.resolve();
            await first;
            await adapter.statePublisher.idle();
        }
        assert.equal(writes.filter(write => write.id === '123456.pregard').at(-1).val, 1000);
        assert.equal(writes.filter(write => write.id === '123456.psurplus').at(-1).val, 20);
    });

    for (const period of [2, 3]) {
        it(`preserves a mean interval of ${period} telegrams across overlapping publication promises`, async () => {
            const { adapter, updCache } = loadAdapter();
            const points = { 0x00010400: point('pregard', 'mean', period) };
            seedCache(updCache, points);
            const completion = deferred();
            const publications = collectPublications(adapter, completion.promise);
            const pending = [];
            for (let index = 1; index <= period * 2; index++) {
                pending.push(adapter.updatePoints('123456', packet([[0x00010400, index * 100]]), points, index * 1000));
            }
            const states = publishedStates(publications);
            assert.deepEqual(states.map(state => state.val), period === 2 ? [150, 350] : [200, 500]);
            assert.deepEqual(states.map(state => state.ts), [period * 1000, period * 2000]);
            completion.resolve();
            await Promise.all(pending);
        });
    }

    it('preserves odd and even median windows without retaining a completed window', async () => {
        for (const [period, input, expected] of [[3, [900, 100, 500], 500], [2, [900, 100], 500]]) {
            const { adapter, updCache } = loadAdapter();
            const points = { 0x00010400: point('cosphi', 'median', period) };
            seedCache(updCache, points);
            const publications = collectPublications(adapter);
            for (let index = 0; index < input.length; index++) {
                await adapter.updatePoints('123456', packet([[0x00010400, input[index]]]), points, 1000 + index);
            }
            assert.deepEqual(publishedStates(publications).map(state => state.val), [expected]);
            assert.equal(updCache.get('123456.cosphi').updValue.length, 0);
        }
    });

    it('publishes only the final 64-bit counter value after its 30-telegram interval', async () => {
        const { adapter, updCache } = loadAdapter();
        const points = { 0x00010800: point('pregardcounter', 'last', 30, 8, 0.001) };
        seedCache(updCache, points);
        const publications = collectPublications(adapter);
        for (let index = 1; index <= 30; index++) {
            await adapter.updatePoints('123456', packet([[0x00010800, 10000000000n + BigInt(index), 8]]), points, index * 1000);
        }
        assert.deepEqual(publishedStates(publications), [
            { id: '123456.pregardcounter', val: 10000000.03, ack: true, ts: 30000 },
        ]);
    });

    it('refreshes unchanged zero-valued each states with the newer telegram timestamp', async () => {
        const { adapter, updCache } = loadAdapter();
        const points = { 0x00020400: point('psurplus', 'each') };
        seedCache(updCache, points);
        const publications = collectPublications(adapter);
        await adapter.updatePoints('123456', packet([[0x00020400, 0]]), points, 1000);
        await adapter.updatePoints('123456', packet([[0x00020400, 0]]), points, 2000);
        assert.deepEqual(publishedStates(publications), [
            { id: '123456.psurplus', val: 0, ack: true, ts: 1000 },
            { id: '123456.psurplus', val: 0, ack: true, ts: 2000 },
        ]);
    });

    it('derives firmware text from the raw snapshot and publishes changes once', async () => {
        const { adapter, updCache } = loadAdapter();
        const points = { 0x90000000: point('sw_version_raw', 'once', 0) };
        seedCache(updCache, points);
        const completion = deferred();
        const publications = collectPublications(adapter, completion.promise);
        const first = adapter.updatePoints('123456', packet([[0x90000000, 0x01020352]]), points, 1000);
        const unchanged = adapter.updatePoints('123456', packet([[0x90000000, 0x01020352]]), points, 2000);
        const changed = adapter.updatePoints('123456', packet([[0x90000000, 0x01020452]]), points, 3000);
        assert.deepEqual(publishedStates(publications), [
            { id: '123456.sw_version_raw', val: 0x01020352, ack: true, ts: 1000 },
            { id: '123456.sw_version', val: '1.2.3.R', ack: true, ts: 1000 },
            { id: '123456.sw_version_raw', val: 0x01020452, ack: true, ts: 3000 },
            { id: '123456.sw_version', val: '1.2.4.R', ack: true, ts: 3000 },
        ]);
        completion.resolve();
        await Promise.all([first, unchanged, changed]);
    });

    it('does not publish a partially decoded telegram when the final value is truncated', async () => {
        const { adapter, updCache } = loadAdapter();
        const points = {
            0x00010400: point('pregard'),
            0x00020400: point('psurplus'),
        };
        seedCache(updCache, points);
        const publications = collectPublications(adapter);
        const complete = packet([[0x00010400, 100], [0x00020400, 200]]);
        const truncated = complete.subarray(0, 28 + 8 + 4 + 2);
        await assert.rejects(adapter.updatePoints('123456', truncated, points, 1000));
        assert.equal(publishedStates(publications).length, 0);
    });
});

describe('SMA UDP device initialization', () => {
    it('skips and counts telegrams while state objects are still being created', async () => {
        const { adapter, socket, serNumsActive } = loadAdapter();
        const creation = deferred();
        let creationCalls = 0;
        let updates = 0;
        adapter.createPoints = () => {
            creationCalls++;
            return creation.promise;
        };
        adapter.updatePoints = async () => { updates++; };
        await adapter.onReady();
        const listener = socket.listeners('message')[0];
        const remote = { address: '192.0.2.20', port: 9522 };
        await listener(packet([], { tick: 1000 }), remote);
        const initialization = listener(packet([], { tick: 2000 }), remote);
        await settleMicrotasks();
        assert.equal(creationCalls, 1);
        assert.equal(serNumsActive.get('123456').initializing, true);
        assert.equal(serNumsActive.get('123456').checkRate, true);
        await listener(packet([], { tick: 3000 }), remote);
        await listener(packet([], { tick: 4000 }), remote);
        assert.equal(creationCalls, 1);
        assert.equal(updates, 0);
        assert.equal(serNumsActive.get('123456').initializationSkipped, 2);
        creation.resolve();
        await initialization;
        assert.equal(serNumsActive.get('123456').initializing, false);
        assert.equal(serNumsActive.get('123456').checkRate, false);
        assert.ok(adapter.messages.some(entry => entry.level === 'warn' && /2/.test(entry.message)));
        await listener(packet([], { tick: 5000 }), remote);
        assert.equal(updates, 1);
    });
});
