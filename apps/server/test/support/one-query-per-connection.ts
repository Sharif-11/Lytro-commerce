import { afterAll } from 'vitest';

/**
 * node-postgres 8 queues queries sent to a connection that is still running one, and warns ("Calling client.query()
 * when the client is already executing a query is deprecated") once one is already waiting; pg 9 drops the queue.
 * Inside one transaction that is a Promise.all over the same `tx`, which staging's logs showed. Each spec file runs in
 * its own process (Vitest's forks pool), so this fails the file whose code did it, with where it was sent from.
 */
const BUSY_CONNECTION = /client is already executing a query/;
const sent: string[] = [];

process.on('warning', (warning) => {
  if (BUSY_CONNECTION.test(warning.message)) sent.push(warning.stack ?? warning.message);
});

afterAll(() => {
  if (sent.length > 0) {
    throw new Error(
      `A query went to a connection still running another; run them in turn:\n${sent.join('\n\n')}`,
    );
  }
});
