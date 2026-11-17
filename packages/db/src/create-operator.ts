import 'dotenv/config';
import { hash } from 'bcryptjs';
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from '@lytronix/validators';
import { DatabaseConnector } from './client';
import { OperatorAccountRepository } from './repositories/operator/operator-account.repository';

// D8: bcrypt with cost 12, same discipline as PasswordHasher (D2) — duplicated here rather than imported,
// since this package never depends on the server app.
const BCRYPT_COST = 12;

/**
 * Creates one operator account, with no TOTP enrollment yet (ADM-01: that happens on first sign-in). Run as
 * its own privileged pipeline step, the same way migrations do (ENGINEERING-STANDARDS §7): never from the live
 * app, which has no credential that can INSERT into `control.operator_accounts` (migration 0024). Reusable for
 * operator #1 now and operator #2+ later (OD-32) — there is no separate one-time "seed" script. The password keeps
 * every Lytro password's length, 8 to 20 characters (the owner, 2026-11-17: 20 at most everywhere): the console's
 * sign-in refuses any other, so an operator made with a longer one could never sign in.
 */
export class OperatorCreator {
  async run(connectionString: string, email: string, password: string): Promise<{ id: string }> {
    if (password.length < PASSWORD_MIN_LENGTH || password.length > PASSWORD_MAX_LENGTH) {
      throw new Error(
        `the password must be ${String(PASSWORD_MIN_LENGTH)} to ${String(PASSWORD_MAX_LENGTH)} characters`,
      );
    }
    const handle = new DatabaseConnector().connect(connectionString, {
      max: 1,
      statementTimeoutMillis: 0,
      applicationName: 'lytronix-create-operator',
    });
    try {
      const passwordHash = await hash(password, BCRYPT_COST);
      const row = await new OperatorAccountRepository().insert(handle.db, {
        email,
        passwordHash,
      });
      return { id: row.id };
    } finally {
      await handle.close();
    }
  }
}

if (require.main === module) {
  const url = process.env['DATABASE_URL'];
  const [email, password] = process.argv.slice(2);
  if (!url) {
    throw new Error('DATABASE_URL is required to create an operator account');
  }
  if (!email || !password) {
    throw new Error('usage: create-operator <email> <password>');
  }
  new OperatorCreator().run(url, email, password).then(
    ({ id }) => {
      console.log(`operator account created: ${id}`);
    },
    (error: unknown) => {
      console.error(error);
      process.exit(1);
    },
  );
}
