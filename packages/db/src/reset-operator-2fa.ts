import 'dotenv/config';
import { PlatformActorType, PlatformAuditAction, AuditResult } from '@lytronix/validators';
import { DatabaseConnector } from './client';
import { OperatorAccountRepository } from './repositories/operator/operator-account.repository';
import { OperatorBackupCodeRepository } from './repositories/operator/operator-backup-code.repository';
import { PlatformAuditLogRepository } from './repositories/platform/platform-audit-log.repository';

/**
 * Break-glass recovery (ADM-18): an operator who has lost both the TOTP device and the backup codes gets a
 * direct, logged database action resetting that account's 2FA enrollment — not an API endpoint, the same
 * category as the activity-log purge (D24) and operator creation, run by whoever has server access, never the
 * live app. Clears the stored secret and confirmation, and invalidates the whole backup-code set, so the
 * account must re-enroll from a fresh QR code before it is usable again. Logs the action to
 * `control.platform_audit_log` in the same transaction, so a reset can never happen silently.
 *
 * ADM-18's second half — once a second operator exists, resetting another operator's 2FA needs that second
 * operator's approval — is not built here: OD-32 keeps the platform solo-operator for now, so there is no
 * second operator to approve anything. Revisit when one exists.
 */
export class OperatorTwoFactorReset {
  async run(connectionString: string, email: string): Promise<void> {
    const handle = new DatabaseConnector().connect(connectionString, {
      max: 1,
      statementTimeoutMillis: 0,
      applicationName: 'lytronix-reset-operator-2fa',
    });
    try {
      await handle.db.transaction(async (tx) => {
        const accounts = new OperatorAccountRepository();
        const account = await accounts.findByEmail(tx, email);
        if (!account) throw new Error(`no operator account for ${email}`);

        await accounts.resetTwoFactor(tx, account.id);
        await new OperatorBackupCodeRepository().deleteAllForOperator(tx, account.id);
        await new PlatformAuditLogRepository().insert(tx, {
          actorType: PlatformActorType.Operator,
          actorId: account.id,
          action: PlatformAuditAction.BreakGlass2faReset,
          targetType: 'operator_account',
          targetId: account.id,
          result: AuditResult.Success,
          ip: null,
          summary: { email },
        });
      });
    } finally {
      await handle.close();
    }
  }
}

if (require.main === module) {
  const url = process.env['DATABASE_URL'];
  const [email] = process.argv.slice(2);
  if (!url) {
    throw new Error("DATABASE_URL is required to reset an operator's 2FA enrollment");
  }
  if (!email) {
    throw new Error('usage: reset-operator-2fa <email>');
  }
  new OperatorTwoFactorReset().run(url, email).then(
    () => {
      console.log(
        `operator 2FA reset for ${email} — re-enrollment is required before next sign-in`,
      );
    },
    (error: unknown) => {
      console.error(error);
      process.exit(1);
    },
  );
}
