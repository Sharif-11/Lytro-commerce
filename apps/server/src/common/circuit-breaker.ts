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
  ) {}

  async call<T>(circuit: string, work: () => Promise<T>): Promise<T> {
    const state = this.circuits.get(circuit) ?? { failures: 0, openUntil: null, trying: false };
    if (state.openUntil !== null) {
      if (state.trying || this.clock() < state.openUntil) throw new CircuitOpen(circuit);
      this.circuits.set(circuit, { ...state, trying: true });
    }
    try {
      const result = await work();
      this.circuits.delete(circuit);
      return result;
    } catch (error) {
      const failures = state.failures + 1;
      const open = state.openUntil !== null || failures >= this.failuresToOpen;
      this.circuits.set(circuit, {
        failures,
        openUntil: open ? this.clock() + this.openMs : null,
        trying: false,
      });
      throw error;
    }
  }
}
