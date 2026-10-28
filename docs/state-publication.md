# Telegram aggregation and state publication

The UDP listener captures `Date.now()` immediately on receipt of an accepted
telegram. This is the **adapter receipt timestamp**, not a device acquisition
timestamp and not the time at which the state database or a subscriber finishes
processing it. SMA's `TimeTick` is used for the existing message-rate detection;
it is not treated as an epoch timestamp.

All available active OBIS fields are decoded and checked before aggregation
starts. A truncated field prevents publication of that telegram and leaves
aggregation buffers unchanged. This is a field-bounds check, not a guarantee
that every expected field is present: a telegram ending exactly at a field
boundary without an end marker is still accepted, as in the previous parser.
Mean, median, and last-value intervals retain their existing
telegram-count semantics. Each completed window receives the receipt timestamp
of its final included telegram. Even an unchanged zero value gets a new
timestamp when its publication interval completes.

Aggregation runs synchronously for every accepted telegram. Completed values
are detached from their buffers before any database write, fixing the case in
which a pending write for a value of 100 allowed the next telegram's value of
200 to become 300. Firmware conversion also uses the detached raw value.

## Bounded publication under load

The publisher has at most one write in flight and one latest waiting snapshot
per state ID. Once a write settles, the newest waiting result for that same
state may be dispatched. Other states do not wait: a blocked `info.connection`
write or one device's measurement cannot impose a publisher-wide barrier on
otherwise writable states. This preserves ordering of this publisher's writes
**per state**, not across different states or devices.

The active and pending maps are each bounded by the number of known state IDs.
There is no new waiter or worker chain per incoming telegram. All callers share
one idle promise, which resolves only when all active and pending work settles.
Errors release the affected state's slot so newer real measurements can proceed.
Unload discards pending work without cancelling or waiting for active writes.
If the backend stalls every state write, this publisher cannot eliminate that
backend delay; it only removes the avoidable dependency between independent IDs.

When publication cannot keep up, a newer waiting result replaces the older
waiting result for that state. This is counted as `coalescedValues` and logged;
it is deliberately **not** claimed to be a complete per-telegram history.
Every accepted sample still enters aggregation, including samples whose
completed publication results are later superseded. The pending map is bounded
by the number of known state IDs, not by the number of incoming telegrams.

Published `ts` values keep their original receipt times even after a delay.
Late database completion never makes an old measurement look newly received.
Same-telegram state timestamps are equal, but writes and subscriber callbacks
are **not atomic**. During publication, readers can briefly see fields from
different telegrams. Consumers requiring a coherent snapshot must check the
timestamps and coverage of all required fields.

## Diagnostic log messages

- `SMA ...: UDP receipt gap ...`: a subsequent accepted telegram arrived more
  than 10 seconds after the preceding one. This measures the listener's receipt
  times, including any local event-loop delay. It does not by itself prove
  network packet loss. It is not a continuous no-packet watchdog.
- `SMA state publication delayed/coalesced ...`: isolated completion delays
  are debug diagnostics. A slow completion reaches at least the greater of 2 seconds
  and the configured realtime interval. Warnings remain for superseded distinct
  waiting values, three slow completions of the same measurement state within
  the greater of 30 seconds and three realtime intervals, or a measurement
  completion/outstanding write age of at least the greater of 10 seconds and
  three realtime intervals. Slow completions of different states are not counted
  as repetitions of one
  measurement; slow connection heartbeats do not count towards repeated
  measurement incidents. At most three recent slow completion times per affected
  state are retained. No autonomous timer is added:
  outstanding work is checked when new updates arrive.
  Warnings are limited to one per 30 seconds; additional events in that period
  go to debug. Similar warning/debug records can therefore describe separate
  replacements or completions during the same backlog episode. Completion
  diagnostics from one microtask turn are combined without waiting for other IDs.
  Completed transient diagnostics are cleared immediately, preventing a stale
  follow-up warning after recovery. The log distinguishes the recent maximum
  completion delay from the lifetime maximum. Counters count states, not outages.
- `SMA state publication failed ...`: actual database failures, counted and
  logged, without manufacturing replacement zero values or fresh timestamps.
  Subsequent telegrams can continue to be published.
- `SMA ...: skipped ... UDP packets during object initialization ...`: packets
  received while the first object/cache initialization was incomplete. They are
  not represented as observed measurements. Discovery/rate-detection packets
  retain the existing startup behavior.

Publisher counters are accessible internally through
`adapter.statePublisher.getStats()` for tests and diagnosis. They do not create
additional high-frequency ioBroker states or SQL recordings. Unload discards
queued work; already dispatched database writes cannot be cancelled.

## Publication timing probe

Existing publication diagnostics include a bounded `timing` JSON object. No
additional per-telegram log messages, ioBroker states or SQL recordings are
created. Aggregation, scheduling and warning thresholds are unchanged.

- `count`: writes completed since the previous emitted diagnostic.
- `maxWaitBeforeWriteMs`: maximum wall-clock age from the original receipt
  timestamp to actual invocation of `writeState`. This includes parsing,
  aggregation/scheduling and per-state queue waiting; it is not pure queue time.
- `maxWriteDurationMs`: maximum observed duration from invocation to settled
  `writeState`, measured with a monotonic clock. This includes downstream
  processing and delays in scheduling the completion callback. It must not be
  equated with database server execution time.
- `slowestWrite`: one matching sample with ID, original receipt/start/finish
  wall-clock timestamps, wait, monotonic write duration and failure flag. The
  maxima can belong to different writes and must not be added together.
- `maxInFlightWriteAgeMs`: monotonic age of the oldest currently invoked write.
  A null completed duration does not imply that an outstanding write is fast.
- `eventLoopDelayMaxMs`: SMA-process event-loop histogram maximum since the
  previous emitted diagnostic (20 ms sampling resolution, enabled on ready and
  disabled on unload). A null value means no histogram samples were available.
  This measures the SMA process, not the controller or whole host.

Recent timing aggregates reset after each diagnostic; the existing getStats()
adds lifetime maxima for wait and write duration. No unbounded sample history is
kept. Wall-clock adjustments can affect receipt-to-start age; only write elapsed
and in-flight elapsed durations use a monotonic clock.

For a comparison test, collect controller CPU/memory and event-loop statistics
alongside these diagnostics and note the exact repository-update time. A large
write duration with low receipt-to-start age localizes the wait to the observed
write/settlement path, but still does not distinguish controller, transport,
backend or callback scheduling without correlated evidence. Controller metrics
are collected externally; this patch does not instrument the controller.

## Regression verification

The tests use the actual adapter implementation with a fake UDP socket and
mock database writes. They never open a network socket or connect to ioBroker.

```sh
npm run test:unit
```

These files also support the existing Mocha test discovery. They cover common
receipt timestamps, overlapping telegrams, aggregation intervals, 64-bit
counters, firmware changes, zero values, truncated telegrams, delayed/failed
writes, queue bounds, and device initialization. Blocked-heartbeat and blocked-
measurement regressions verify independent progress, per-state ordering,
latest-value coalescing, failure recovery, reentrant enqueueing and shutdown.
An adapter-level test checks both devices and aggregation timestamps while the
connection-state write remains blocked.

Before an upstream merge, run the repository's full lint, package, integration,
and supported Node/OS CI matrix. These isolated tests do not constitute a live
acceptance test, and the patch does not prove the cause of any previously
observed timestamp spread.

For a later supervised deployment, compare receipt-gap messages with
publication-latency messages and independent subscribers' `state.ts`/callback
times. Continue to distinguish source receipt age, publication delay, and
consumer delivery delay. Interface-specific multicast selection and packet
deduplication are separate open checks; this patch changes neither setting.
