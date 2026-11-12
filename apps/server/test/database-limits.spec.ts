import { describe, expect, it } from 'vitest';
import { EnvironmentParser } from '../src/config/env';
import { DatabaseService, connectionLimitsOf } from '../src/database/database.service';

// Slice 9.2 (DAT-23): behind PgBouncer the pooler sets the API's limits, so the server sends none; connecting directly
// (the worker), it sends its statement limit and, on PostgreSQL 17, how long a transaction may stay open. That the
// database then ends a transaction held past it is packages/db's connector-limits spec.
describe('the limits a connection is opened with (DAT-23)', () => {
  it('sends none through the pooler, which sets its own', () => {
    expect(
      connectionLimitsOf({
        DATABASE_THROUGH_POOLER: true,
        DATABASE_STATEMENT_TIMEOUT_MS: 10_000,
        DATABASE_TRANSACTION_TIMEOUT_MS: 60_000,
      }),
    ).toEqual({});
  });

  it('sends the statement limit directly, and the transaction limit only when one is set', () => {
    expect(
      connectionLimitsOf({
        DATABASE_THROUGH_POOLER: false,
        DATABASE_STATEMENT_TIMEOUT_MS: 10_000,
        DATABASE_TRANSACTION_TIMEOUT_MS: undefined,
      }),
    ).toEqual({ statementTimeoutMillis: 10_000 });
    expect(
      connectionLimitsOf({
        DATABASE_THROUGH_POOLER: false,
        DATABASE_STATEMENT_TIMEOUT_MS: 10_000,
        DATABASE_TRANSACTION_TIMEOUT_MS: 60_000,
      }),
    ).toEqual({ statementTimeoutMillis: 10_000, transactionTimeoutMillis: 60_000 });
  });
});

describe('a read whose connection was lost (DAT-23)', () => {
  const database = new DatabaseService(
    new EnvironmentParser().parse({
      ...process.env,
      NODE_ENV: 'test',
      DATABASE_URL: 'postgres://nobody@127.0.0.1:1/none',
      OTP_SECRET: 'read-retry-spec-otp-secret-0123456789abcdef',
    }),
  );
  const lost = (): Error => new Error('Connection terminated unexpectedly');

  it('is tried once more, and answers from the second try', async () => {
    let tries = 0;
    const read = (): Promise<string> =>
      ++tries === 1 ? Promise.reject(lost()) : Promise.resolve('rows');
    await expect(database.readRetrying(read)).resolves.toBe('rows');
    expect(tries).toBe(2);
  });

  it('fails when the second try is lost too, and never retries any other failure', async () => {
    let tries = 0;
    await expect(
      database.readRetrying(() => {
        tries += 1;
        return Promise.reject(lost());
      }),
    ).rejects.toThrow('Connection terminated');
    expect(tries).toBe(2);

    tries = 0;
    await expect(
      database.readRetrying(() => {
        tries += 1;
        return Promise.reject(new Error('relation does not exist'));
      }),
    ).rejects.toThrow('relation');
    expect(tries).toBe(1);
  });
});
