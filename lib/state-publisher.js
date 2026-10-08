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
     * @param {(message: string) => void} [options.onError] Failed-write logger.
     * @param {() => number} [options.now] Clock used only for diagnostics.
     * @param {number} [options.slowMs] Receive-to-completion warning threshold.
     * @param {number} [options.warningIntervalMs] Minimum interval between warnings.
     */
    constructor({
        writeState,
        onWarning = () => {},
        onError = () => {},
        now = Date.now,
        slowMs = 2000,
        warningIntervalMs = 30000,
    }) {
        this.writeState = writeState;
        this.onWarning = onWarning;
        this.onError = onError;
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
                this.coalescedSinceWarning++;
                this.warningIds.add(update.id);
            }
            this.pending.set(update.id, structuredClone(update.state));
        }
        if (this.coalescedSinceWarning > 0) {
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
                        if (delay >= this.slowMs) {
                            this.stats.slowValues++;
                            this.slowSinceWarning++;
                            this.warningIds.add(id);
                        }
                    }
                }),
            );
            this.active = [];
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
        if (this.coalescedSinceWarning === 0 && this.slowSinceWarning === 0) {
            return;
        }
        const now = this.now();
        if (now - this.warningAt < this.warningIntervalMs) {
            return;
        }
        const timestamps = [...this.pending.values(), ...this.active.map(update => update.state)]
            .map(state => state.ts)
            .filter(ts => typeof ts === 'number' && Number.isFinite(ts));
        const age = timestamps.length > 0 ? Math.max(0, now - Math.min(...timestamps)) : null;
        this.logSafely(
            this.onWarning,
            `SMA state publication delayed/coalesced: coalesced=${this.coalescedSinceWarning} ` +
                `(total=${this.stats.coalescedValues}), slow=${this.slowSinceWarning}, ` +
                `queued=${this.pending.size}, active=${this.active.length}, ` +
                `oldestOutstandingAgeMs=${age ?? 'unknown'}, ` +
                `maxReceiveToCompletionMs=${this.stats.maxDelayMs ?? 'unknown'}, ` +
                `states=${Array.from(this.warningIds).join(',')}`,
        );
        this.warningAt = now;
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
