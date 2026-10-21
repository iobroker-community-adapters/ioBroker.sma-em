'use strict';

/**
 * Publish immutable measurement snapshots without overlapping writes to a state.
 * One parallel batch is in flight. While it is pending, only the latest waiting
 * snapshot for each state is retained. Aggregation belongs to the caller and
 * must happen for every packet before enqueueing these publication snapshots.
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
        this.slowBatches = [];
        this.severeMeasurement = false;
        this.recentMaxDelayMs = 0;
        this.now = now;
        this.slowMs = slowMs;
        this.warningIntervalMs = warningIntervalMs;
        this.pending = new Map();
        this.active = [];
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
     * @returns {Promise<void>} Completion of the current drain, including its waiting batches.
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
        if (this.coalescedSinceWarning > 0 || this.active.length > 0) {
            this.warnIfNeeded();
        }
        return this.drain();
    }

    /**
     * Start draining if necessary. The final check covers enqueueing between
     * flush completion and the promise's finalizer, without stranding a value.
     *
     * @returns {Promise<void>} Publisher idle promise.
     */
    drain() {
        if (!this.drainPromise && !this.closed && this.pending.size > 0) {
            this.drainPromise = Promise.resolve()
                .then(() => this.flush())
                .catch(error => this.logSafely(this.onError, `SMA state publisher failed: ${error}`))
                .finally(() => {
                    this.drainPromise = null;
                    if (!this.closed && this.pending.size > 0) {
                        return this.drain();
                    }
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
            activeStates: this.active.length,
            closed: this.closed,
        };
    }

    /**
     * @returns {Promise<void>} Completion of all currently pending batches.
     */
    async flush() {
        while (!this.closed && this.pending.size > 0) {
            const batch = Array.from(this.pending, ([id, state]) => ({ id, state }));
            this.pending.clear();
            this.active = batch;
            this.stats.maxActiveStates = Math.max(this.stats.maxActiveStates, batch.length);
            const failures = [];
            let slowMeasurement = false;
            await Promise.all(
                batch.map(async ({ id, state }) => {
                    const receivedAt = state.ts;
                    try {
                        await this.writeState(id, structuredClone(state));
                        this.stats.writtenValues++;
                    } catch (error) {
                        this.stats.failures++;
                        failures.push({ id, error: String(error) });
                    }
                    if (typeof receivedAt === 'number' && Number.isFinite(receivedAt)) {
                        const delay = Math.max(0, this.now() - receivedAt);
                        this.stats.maxDelayMs = Math.max(this.stats.maxDelayMs ?? 0, delay);
                        if (delay >= Math.max(this.slowMs, this.updateIntervalMs)) {
                            this.recentMaxDelayMs = Math.max(this.recentMaxDelayMs, delay);
                            if (id !== 'info.connection') {
                                slowMeasurement = true;
                                this.severeMeasurement ||= delay >= Math.max(10000, 3 * this.updateIntervalMs);
                            }
                            this.stats.slowValues++;
                            this.slowSinceWarning++;
                            this.warningIds.add(id);
                        }
                    }
                }),
            );
            this.active = [];
            const now = this.now();
            const repeatWindowMs = Math.max(30000, 3 * this.updateIntervalMs);
            this.slowBatches = this.slowBatches.filter(time => now - time <= repeatWindowMs);
            if (slowMeasurement) {
                this.slowBatches.push(now);
                this.slowBatches = this.slowBatches.slice(-3);
            }
            if (failures.length > 0) {
                const failureDetails = failures.map(({ id, error }) => `${id}: ${error}`).join('; ');
                this.logSafely(
                    this.onError,
                    `SMA state publication failed for ${failures.length} value(s): ${failureDetails}`,
                );
            }
            this.warnIfNeeded();
        }
    }

    /**
     * Report slow/coalesced work without treating its eventual write as fresh data.
     */
    warnIfNeeded() {
        const now = this.now();
        const timestamps = [...this.pending.values(), ...this.active.map(update => update.state)]
            .map(state => state.ts)
            .filter(ts => typeof ts === 'number' && Number.isFinite(ts));
        const age = timestamps.length > 0 ? Math.max(0, now - Math.min(...timestamps)) : null;
        const sustained = age !== null && age >= Math.max(10000, 3 * this.updateIntervalMs);
        if (this.coalescedSinceWarning === 0 && this.slowSinceWarning === 0 && !sustained) {
            return;
        }
        const repeated =
            this.slowBatches.length >= 3 && now - this.slowBatches[0] <= Math.max(30000, 3 * this.updateIntervalMs);
        const needsWarning = this.coalescedSinceWarning > 0 || this.severeMeasurement || repeated || sustained;
        const warn = needsWarning && now - this.warningAt >= this.warningIntervalMs;
        // Never carry completed transient delays into a later warning after recovery.
        this.logSafely(
            warn ? this.onWarning : this.onDebug,
            `SMA state publication delayed/coalesced: coalesced=${this.coalescedSinceWarning} ` +
                `(total=${this.stats.coalescedValues}), slow=${this.slowSinceWarning}, ` +
                `queued=${this.pending.size}, active=${this.active.length}, ` +
                `oldestOutstandingAgeMs=${age ?? 'unknown'}, ` +
                `recentMaxReceiveToCompletionMs=${this.recentMaxDelayMs}, ` +
                `maxReceiveToCompletionMs=${this.stats.maxDelayMs ?? 'unknown'} (lifetime), ` +
                `states=${Array.from(this.warningIds).join(',')}`,
        );
        if (warn) {
            this.warningAt = now;
        }
        this.severeMeasurement = false;
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
