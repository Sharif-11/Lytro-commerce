import { performance } from 'node:perf_hooks';
import { MINUTE_MS } from './time';

// PRF-05: failures in a row that open a circuit, and how long it stays open before one trial call.
export const BREAKER_FAILURES = 5;
export const BREAKER_OPEN_MS = MINUTE_MS;

/** PRF-05: a call refused at once, with no outbound attempt, while its circuit is open. */
export class CircuitOpen extends Error {
  constructor(readonly circuit: string) {
    super(`circuit ${circuit} is open`);
    this.name = 'CircuitOpen';
  }
}

/**
 * PRF-04, D9-17 (Slice 9.5): how one call through a circuit went. `ok`: it answered; `failed`: it threw, which counts
 * against the circuit; `refused`: the circuit was open, so no call was made. These names are the log's and Slice 9.6's.
 */
export type OutsideOutcome = 'ok' | 'failed' | 'refused';

/** PRF-04, D9-17 (Slice 9.5): one call to an outside service, timed, for the log and the request's outside time. */
export interface OutsideCall {
  /** The outside service called: 'bkash', 'steadfast', 'r2', 'cloudflare', 'google'. */
  service: string;
  /** The circuit the call went through, as the breaker keys it. */
  circuit: string;
  ms: number;
  outcome: OutsideOutcome;
}

/** PRF-05: a circuit that has just opened, told once each time a closed one opens. */
export interface OpenedCircuit {
  service: string;
  circuit: string;
  failures: number;
}

export interface BreakerOptions {
  /** The outside service the circuits call, or how to tell it from a circuit when one breaker serves several. */
  service?: string | ((circuit: string) => string);
  clock?: () => number;
  failuresToOpen?: number;
  openMs?: number;
  /** PRF-05: told once each time a closed circuit opens, so the caller can say so (Phase 6 close-out). */
  onOpen?: (opened: OpenedCircuit) => void;
  /** PRF-04 (Slice 9.5): told of every call, timed, refused ones included. */
  onCall?: (call: OutsideCall) => void;
  /** What the calls are timed with; a monotonic clock, apart from `clock`, which tests set. */
  timer?: () => number;
}

interface Circuit {
  failures: number;
  /** When the open circuit lets one trial call through; null while closed. */
  openUntil: number | null;
  /** A trial call is out, so every other call still fails fast. */
  trying: boolean;
}

/**
 * PRF-05: a circuit per provider account (a shop's own credentials) or per provider. After five failures in a row it
 * opens, and for a minute calls fail fast with `CircuitOpen`, making no outbound attempt; then one trial call decides:
 * a success closes it, a failure opens it for another minute. In memory, per server, like the rate windows (D3-2).
 * PRF-04, D9-17 (Slice 9.5): every call is timed and told to `onCall`, so the time spent waiting on an outside service
 * is seen apart from Lytro's own.
 */
export class CircuitBreaker {
  private readonly circuits = new Map<string, Circuit>();
  private readonly clock: () => number;
  private readonly failuresToOpen: number;
  private readonly openMs: number;
  private readonly timer: () => number;

  constructor(private readonly options: BreakerOptions = {}) {
    this.clock = options.clock ?? Date.now;
    this.failuresToOpen = options.failuresToOpen ?? BREAKER_FAILURES;
    this.openMs = options.openMs ?? BREAKER_OPEN_MS;
    this.timer = options.timer ?? (() => performance.now());
  }

  async call<T>(circuit: string, work: () => Promise<T>): Promise<T> {
    const state = this.circuits.get(circuit) ?? { failures: 0, openUntil: null, trying: false };
    if (state.openUntil !== null) {
      if (state.trying || this.clock() < state.openUntil) {
        this.told(circuit, 0, 'refused');
        throw new CircuitOpen(circuit);
      }
      this.circuits.set(circuit, { ...state, trying: true });
    }
    const trial = state.openUntil !== null;
    const started = this.timer();
    try {
      const result = await work();
      this.told(circuit, this.timer() - started, 'ok');
      // A call that started before the circuit opened says nothing about it now; only the trial closes it.
      if (trial || this.circuits.get(circuit)?.openUntil == null) this.circuits.delete(circuit);
      return result;
    } catch (error) {
      this.told(circuit, this.timer() - started, 'failed');
      this.failed(circuit, trial);
      throw error;
    }
  }

  /** The outside service a circuit calls. */
  serviceOf(circuit: string): string {
    const { service } = this.options;
    if (typeof service === 'function') return service(circuit);
    return service ?? 'outside';
  }

  private told(circuit: string, ms: number, outcome: OutsideOutcome): void {
    this.options.onCall?.({
      service: this.serviceOf(circuit),
      circuit,
      ms: Math.max(0, Math.round(ms)),
      outcome,
    });
  }

  /** Counts a failure against the circuit as it stands now, as calls overlap. An open circuit waits for its trial. */
  private failed(circuit: string, trial: boolean): void {
    const now = this.circuits.get(circuit) ?? { failures: 0, openUntil: null, trying: false };
    if (now.openUntil !== null && !trial) return;
    const failures = now.failures + 1;
    const open = trial || failures >= this.failuresToOpen;
    this.circuits.set(circuit, {
      failures,
      openUntil: open ? this.clock() + this.openMs : null,
      trying: false,
    });
    if (open && !trial)
      this.options.onOpen?.({ service: this.serviceOf(circuit), circuit, failures });
  }
}
