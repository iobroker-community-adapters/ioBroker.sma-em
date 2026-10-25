'use strict';

/**
 * Publish immutable measurement snapshots without overlapping writes to a state.
 * Each state has at most one write in flight and one latest waiting snapshot.
 * Independent states progress without a batch-wide completion barrier.
 * Aggregation belongs to the caller and must happen for every packet before
 * enqueueing these publication snapshots.
 */
class StatePublisher {
    /**
     * @param {object} options Publisher callbacks and diagnostic limits.
     * @param {(id: string, state: ioBroker.SettableState) => Promise<unknown> | unknown} options.writeState State writer.
     * @param {(message: string) => void} [options.onWarning] Rate-limited diagnostic logger.
     * @param {(message: string) => void} [options.onDebug] Transient publication diagnostics.
     * @param {number} [options.updateIntervalMs] Configured realtime interval in milliseconds.
     * @param {(message: string) => void} [options.onError] Failed-write logger.
     * @param {() => number} [options.now] Clock used only for diagnostics.
     * @param {number} [options.slowMs] Receive-to-completion warning threshold.
     * @param {number} [options.warningIntervalMs] Minimum interval between warnings.
     */
    constructor({
        writeState,
        onWarning = () => {},
        onError = () => {},
        onDebug = () => {},
        updateIntervalMs = 1000,
        now = Date.now,
        slowMs = 2000,
        warningIntervalMs = 30000,
    }) {
        this.writeState = writeState;
        this.onWarning = onWarning;
        this.onError = onError;
        this.onDebug = onDebug;
        this.updateIntervalMs = updateIntervalMs;
        this.slowCompletions = new Map();
        this.repeatedMeasurement = false;
        this.severeMeasurement = false;
        this.recentMaxDelayMs = 0;
        this.now = now;
        this.slowMs = slowMs;
        this.warningIntervalMs = warningIntervalMs;
        this.pending = new Map();
        this.active = new Map();
        this.flushScheduled = false;
        this.diagnosticsScheduled = false;
        this.resolveDrain = null;
        this.drainPromise = null;
        this.closed = false;
        this.warningAt = -Infinity;
        this.warningIds = new Set();
        this.coalescedSinceWarning = 0;
        this.slowSinceWarning = 0;
        this.stats = {
            enqueuedValues: 0,
            writtenValues: 0,
            failures: 0,
            coalescedValues: 0,
            discardedValues: 0,
            slowValues: 0,
            maxActiveStates: 0,
            maxDelayMs: null,
        };
    }

    /**
     * Enqueue independent copies; an older waiting value may be superseded.
     * Measurement timestamps are retained and are never replaced with now().
     *
     * @param {{ id: string, state: ioBroker.SettableState }[]} updates Publication snapshots.
     * @returns {Promise<void>} Completion of all current and subsequently enqueued publication work.
     */
    enqueue(updates) {
        this.stats.enqueuedValues += updates.length;
        if (this.closed) {
            this.stats.discardedValues += updates.length;
            return this.idle();
        }
        for (const update of updates) {
            if (this.pending.has(update.id)) {
                this.stats.coalescedValues++;
                // Repeated connection heartbeats do not supersede a distinct status.
                // Still retain the newest receipt timestamp and count the coalescing.
                const previous = this.pending.get(update.id);
                const sameConnection =
                    update.id === 'info.connection' &&
                    typeof previous.val === 'boolean' &&
                    previous.val === update.state.val &&
                    previous.ack === update.state.ack &&
                    previous.q === update.state.q;
                if (!sameConnection) {
                    this.coalescedSinceWarning++;
                    this.warningIds.add(update.id);
                }
            }
            this.pending.set(update.id, structuredClone(update.state));
        }
        if (this.coalescedSinceWarning > 0 || this.active.size > 0) {
            this.warnIfNeeded();
        }
        return this.drain();
    }

    /**
     * Share one idle promise, and schedule work without attaching a waiter per packet.
     *
     * @returns {Promise<void>} Completion once all active and waiting states are idle.
     */
    drain() {
        if (!this.drainPromise && (this.active.size > 0 || (!this.closed && this.pending.size > 0))) {
            this.drainPromise = new Promise(resolve => {
                this.resolveDrain = resolve;
            });
        }
        if (!this.flushScheduled && this.drainPromise) {
            this.flushScheduled = true;
            void Promise.resolve().then(() => {
                this.flushScheduled = false;
                this.flush();
            });
        }
        return this.drainPromise || Promise.resolve();
    }

    /**
     * @returns {Promise<void>} Completion of existing publication work.
     */
    idle() {
        return this.drain();
    }

    /**
     * Stop accepting work and discard queued values without blocking unload.
     * Already dispatched database writes cannot be cancelled and finish normally.
     *
     * @returns {object} Final/current diagnostic snapshot.
     */
    close() {
        this.closed = true;
        this.stats.discardedValues += this.pending.size;
        this.pending.clear();
        return this.getStats();
    }

    /**
     * @returns {object} Counters and bounded queue sizes, with no measurement values.
     */
    getStats() {
        return {
            ...this.stats,
            queuedStates: this.pending.size,
            activeStates: this.active.size,
            closed: this.closed,
        };
    }

    /**
     * Dispatch every available state independently. The active slot is reserved
     * before calling the writer, including for synchronous throws/reentrant calls.
     */
    flush() {
        if (!this.closed) {
            for (const [id, state] of this.pending) {
                if (this.active.has(id)) {
                    continue;
                }
                this.pending.delete(id);
                this.active.set(id, state);
                this.stats.maxActiveStates = Math.max(this.stats.maxActiveStates, this.active.size);
                void this.publish(id, state);
            }
        }
        if (this.active.size === 0 && this.pending.size === 0 && this.resolveDrain) {
            const resolve = this.resolveDrain;
            this.resolveDrain = null;
            this.drainPromise = null;
            resolve();
        }
    }

    /**
     * Finish one state's write before allowing its latest waiting result through.
     * Other states never wait for this promise. Failed writes are not retried with
     * fabricated timestamps; subsequent real measurements may still be published.
     *
     * @param {string} id State identifier.
     * @param {ioBroker.SettableState} state Detached measurement snapshot.
     * @returns {Promise<void>} Completion of this write and its bookkeeping.
     */
    async publish(id, state) {
        try {
            await Promise.resolve().then(() => this.writeState(id, structuredClone(state)));
            this.stats.writtenValues++;
        } catch (error) {
            this.stats.failures++;
            this.logSafely(this.onError, `SMA state publication failed for ${id}: ${error}`);
        }
        const now = this.now();
        const receivedAt = state.ts;
        if (typeof receivedAt === 'number' && Number.isFinite(receivedAt)) {
            const delay = Math.max(0, now - receivedAt);
            this.stats.maxDelayMs = Math.max(this.stats.maxDelayMs ?? 0, delay);
            if (delay >= Math.max(this.slowMs, this.updateIntervalMs)) {
                this.recentMaxDelayMs = Math.max(this.recentMaxDelayMs, delay);
                if (id !== 'info.connection') {
                    const repeatWindowMs = Math.max(30000, 3 * this.updateIntervalMs);
                    const history = (this.slowCompletions.get(id) || []).filter(time => now - time <= repeatWindowMs);
                    history.push(now);
                    this.slowCompletions.set(id, history.slice(-3));
                    this.repeatedMeasurement ||= history.length >= 3;
                    this.severeMeasurement ||= delay >= Math.max(10000, 3 * this.updateIntervalMs);
                }
                this.stats.slowValues++;
                this.slowSinceWarning++;
                this.warningIds.add(id);
            }
        }
        this.active.delete(id);
        this.scheduleDiagnostics();
        this.drain();
    }

    /**
     * Combine completions from the same microtask turn into one diagnostic,
     * without waiting for an unrelated blocked state to finish.
     */
    scheduleDiagnostics() {
        if (!this.diagnosticsScheduled) {
            this.diagnosticsScheduled = true;
            void Promise.resolve().then(() => {
                this.diagnosticsScheduled = false;
                this.warnIfNeeded();
            });
        }
    }

    /**
     * Report slow/coalesced work without treating its eventual write as fresh data.
     */
    warnIfNeeded() {
        const now = this.now();
        const timestamps = [...this.pending.values(), ...this.active.values()]
            .map(state => state.ts)
            .filter(ts => typeof ts === 'number' && Number.isFinite(ts));
        const age = timestamps.length > 0 ? Math.max(0, now - Math.min(...timestamps)) : null;
        const sustained = age !== null && age >= Math.max(10000, 3 * this.updateIntervalMs);
        if (this.coalescedSinceWarning === 0 && this.slowSinceWarning === 0 && !sustained) {
            return;
        }
        const needsWarning =
            this.coalescedSinceWarning > 0 || this.severeMeasurement || this.repeatedMeasurement || sustained;
        const warn = needsWarning && now - this.warningAt >= this.warningIntervalMs;
        // Never carry completed transient delays into a later warning after recovery.
        this.logSafely(
            warn ? this.onWarning : this.onDebug,
            `SMA state publication delayed/coalesced: coalesced=${this.coalescedSinceWarning} ` +
                `(total=${this.stats.coalescedValues}), slow=${this.slowSinceWarning}, ` +
                `queued=${this.pending.size}, active=${this.active.size}, ` +
                `oldestOutstandingAgeMs=${age ?? 'unknown'}, ` +
                `recentMaxReceiveToCompletionMs=${this.recentMaxDelayMs}, ` +
                `maxReceiveToCompletionMs=${this.stats.maxDelayMs ?? 'unknown'} (lifetime), ` +
                `states=${Array.from(this.warningIds).join(',')}`,
        );
        if (warn) {
            this.warningAt = now;
        }
        this.severeMeasurement = false;
        this.repeatedMeasurement = false;
        this.recentMaxDelayMs = 0;
        this.coalescedSinceWarning = 0;
        this.slowSinceWarning = 0;
        this.warningIds.clear();
    }

    /**
     * A logging callback must not leave rejected enqueue promises behind.
     *
     * @param {(message: string) => void} logger Diagnostic callback.
     * @param {string} message Diagnostic message.
     */
    logSafely(logger, message) {
        try {
            logger(message);
        } catch {
            // Logging failure does not change publication or timestamp semantics.
        }
    }
}

module.exports = { StatePublisher };
