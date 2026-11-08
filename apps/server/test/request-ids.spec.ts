import { describe, expect, it } from 'vitest';
import { REQUEST_ID_ALPHABET, REQUEST_ID_PATTERN } from '@lytronix/validators';
import { RequestContext } from '../src/common/request-id/request-context';
import { RequestIds } from '../src/common/request-id/request-ids';
import { RequestLogger } from '../src/common/request-id/request-logger';

// API-27, D8-21 (Phase 8 Slice 8.1): the request ID's form, and the logger that prints it.
class VisibleLogger extends RequestLogger {
  contextOf(context: string): string {
    return this.formatContext(context);
  }
}

describe('request IDs (API-27, D8-21)', () => {
  it('are eight characters in two halves, from letters and digits that read apart', () => {
    const ids = new RequestIds();
    const seen = new Set<string>();
    for (let i = 0; i < 2_000; i += 1) {
      const id = ids.next();
      expect(id).toMatch(REQUEST_ID_PATTERN);
      seen.add(id);
    }
    expect(seen.size).toBe(2_000);
    expect(REQUEST_ID_ALPHABET).toHaveLength(31);
    expect(REQUEST_ID_ALPHABET).not.toMatch(/[01OIL]/);
  });

  it('agree with the pattern on every character of the alphabet', () => {
    for (const char of REQUEST_ID_ALPHABET) {
      expect(`${char.repeat(4)}-${char.repeat(4)}`).toMatch(REQUEST_ID_PATTERN);
    }
    for (const char of '01OIL') {
      expect(`${char.repeat(4)}-2222`).not.toMatch(REQUEST_ID_PATTERN);
    }
  });
});

describe('the request logger (API-27)', () => {
  it("adds the request's ID after the context while the request runs, and nothing outside one", () => {
    const requests = new RequestContext();
    const logger = new VisibleLogger(requests);
    const outside = logger.contextOf('Orders');
    const inside = requests.run('K7MQ-4XR2', () => logger.contextOf('Orders'));
    expect(outside).not.toContain('K7MQ-4XR2');
    expect(inside).toContain('[K7MQ-4XR2] ');
    expect(inside.startsWith(outside)).toBe(true);
  });

  it('keeps the ID across awaits within the request', async () => {
    const requests = new RequestContext();
    const seen = await requests.run('K7MQ-4XR2', async () => {
      await new Promise((resolve) => setTimeout(resolve, 5));
      return requests.requestId();
    });
    expect(seen).toBe('K7MQ-4XR2');
    expect(requests.requestId()).toBeUndefined();
  });
});
