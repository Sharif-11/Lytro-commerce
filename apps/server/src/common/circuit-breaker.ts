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
 */
export class CircuitBreaker {
  private readonly circuits = new Map<string, Circuit>();

  constructor(
    private readonly clock: () => number = Date.now,
    private readonly failuresToOpen = BREAKER_FAILURES,
    private readonly openMs = BREAKER_OPEN_MS,
    /** PRF-05: told once each time a closed circuit opens, so the caller can say so (Phase 6 close-out). */
    private readonly onOpen: (circuit: string, failures: number) => void = () => undefined,
  ) {}

  async call<T>(circuit: string, work: () => Promise<T>): Promise<T> {
    const state = this.circuits.get(circuit) ?? { failures: 0, openUntil: null, trying: false };
    if (state.openUntil !== null) {
      if (state.trying || this.clock() < state.openUntil) throw new CircuitOpen(circuit);
      this.circuits.set(circuit, { ...state, trying: true });
    }
    const trial = state.openUntil !== null;
    try {
      const result = await work();
      // A call that started before the circuit opened says nothing about it now; only the trial closes it.
      if (trial || this.circuits.get(circuit)?.openUntil == null) this.circuits.delete(circuit);
      return result;
    } catch (error) {
      this.failed(circuit, trial);
      throw error;
    }
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
    if (open && !trial) this.onOpen(circuit, failures);
  }
}
