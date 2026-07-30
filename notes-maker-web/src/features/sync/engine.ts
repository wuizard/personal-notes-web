import {getDb} from "@/features/storage/db";
import {META} from "@/features/storage/types";
import {ApiError, ApiUnavailableError} from "@/shared/api/graphql";
import {pull} from "./pull";
import {countDirty, push, type ConflictLabel} from "./push";
import {setSyncStatus} from "./status";

/**
 * One sync run: pull, then push.
 *
 * That order is not arbitrary. Push carries each note's `base_rev`, and the
 * server uses it to work out which fields *it* changed since. Pulling first
 * means those base_revs are as current as they can be, so two devices editing
 * different fields merge silently instead of colliding.
 */

/**
 * Push is capped at 100 mutations, so a large backlog needs several rounds.
 * Bounded so a server that never accepts anything cannot spin.
 */
const MAX_PUSH_ROUNDS = 20;

/** docs/04 §4.6, with jitter added at use. The last value repeats. */
const BACKOFF_MS = [1_000, 2_000, 4_000, 8_000, 16_000, 30_000];

let failures = 0;
let inFlight: Promise<SyncOutcome> | null = null;

export interface SyncOutcome {
  ok: boolean;
  received: number;
  applied: number;
  conflicted: number;
  rejected: number;
}

const EMPTY: SyncOutcome = { ok: true, received: 0, applied: 0, conflicted: 0, rejected: 0 };

/** How long to wait before the next attempt, jittered so many tabs returning
 *  online together don't retry in lockstep. */
export function backoffDelay(): number {
  const base = BACKOFF_MS[Math.min(failures, BACKOFF_MS.length - 1)];
  return base + Math.random() * base * 0.25;
}

export function consecutiveFailures(): number {
  return failures;
}

/**
 * Runs a sync, or joins the one already running.
 *
 * Single-flight matters more than it looks: the engine is triggered by six
 * different events (§4.6), several of which fire together — a tab regaining
 * focus while the network comes back is one action, not two syncs racing to
 * write the same rows.
 */
export function sync(conflictLabel: ConflictLabel): Promise<SyncOutcome> {
  inFlight ??= run(conflictLabel).finally(() => {
    inFlight = null;
  });
  return inFlight;
}

async function run(conflictLabel: ConflictLabel): Promise<SyncOutcome> {
  setSyncStatus({ state: "syncing", error: null });

  const outcome: SyncOutcome = { ...EMPTY };

  try {
    const pulled = await pull();
    outcome.received = pulled.received;

    for (let round = 0; round < MAX_PUSH_ROUNDS; round++) {
      const pushed = await push(conflictLabel);
      outcome.applied += pushed.applied;
      outcome.conflicted += pushed.conflicted;
      outcome.rejected += pushed.rejected;
      if (!pushed.remaining) break;
    }

    // A conflict fork creates a new local note, and the server has not seen
    // it yet — so the queue is re-counted rather than assumed empty.
    const queued = await countDirty();
    const now = Date.now();
    await getDb().meta.put({ key: META.syncLastAt, value: now });

    failures = 0;
    setSyncStatus({ state: "idle", queued, lastSyncedAt: now, error: null });
    return outcome;
  } catch (error) {
    outcome.ok = false;
    await reportFailure(error);
    return outcome;
  }
}

async function reportFailure(error: unknown): Promise<void> {
  const queued = await countDirty().catch(() => 0);

  if (error instanceof ApiUnavailableError) {
    // Signed out, or no API configured. Not a failure to back off from —
    // there is simply nothing to sync with.
    failures = 0;
    setSyncStatus({ state: "disabled", queued, error: null });
    return;
  }

  if (error instanceof ApiError && error.retryable) {
    failures++;
    setSyncStatus({ state: "offline", queued, error: null });
    return;
  }

  // The server answered and refused — a lapsed subscription, most likely.
  // Retrying sends the identical request, so this does not back off; it waits
  // for something about the situation to change.
  failures = 0;
  setSyncStatus({
    state: "error",
    queued,
    error: error instanceof Error ? error.message : String(error),
  });
}

export async function readLastSyncedAt(): Promise<number | null> {
  const row = await getDb().meta.get(META.syncLastAt);
  return typeof row?.value === "number" ? row.value : null;
}

/** Test seam — clears the single-flight latch and backoff state. */
export function resetEngine(): void {
  failures = 0;
  inFlight = null;
}
