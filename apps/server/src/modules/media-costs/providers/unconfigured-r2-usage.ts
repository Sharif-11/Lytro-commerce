import type { R2DayFigures, R2Usage } from '../ports/r2-usage';

/** No Cloudflare token set (development, tests): there is nothing to read, and the console says it isn't connected. */
export class UnconfiguredR2Usage implements R2Usage {
  readonly connected = false;

  days(): Promise<R2DayFigures[]> {
    return Promise.resolve([]);
  }
}
