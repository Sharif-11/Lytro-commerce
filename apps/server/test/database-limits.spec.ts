import { describe, expect, it } from 'vitest';
import { connectionLimitsOf } from '../src/database/database.service';

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
