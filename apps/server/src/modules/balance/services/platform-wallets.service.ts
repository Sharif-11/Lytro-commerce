import { Inject, Injectable } from '@nestjs/common';
import { AuditResult, PlatformActorType, PlatformAuditAction } from '@lytronix/validators';
import { ApiError } from '../../../common/api-error';
import { PlatformAuditService } from '../../audit/services/platform-audit.service';
import type {
  NewPlatformWalletValues,
  PlatformWalletsStore,
  UpdatePlatformWalletValues,
} from '../ports/platform-wallets-store';
import { PLATFORM_WALLETS_STORE } from '../tokens';
import type { PlatformWallet } from '../types/platform-wallet';

/**
 * The platform's own wallet numbers (BIL-02/BAL-03) -- a tenant pays into one of these when buying a plan or
 * topping up balance. Not WAL-* (Phase 5): that is a tenant's own wallet accounts for receiving payments from
 * its shoppers.
 */
@Injectable()
export class PlatformWalletsService {
  constructor(
    @Inject(PLATFORM_WALLETS_STORE) private readonly store: PlatformWalletsStore,
    @Inject(PlatformAuditService) private readonly platformAudit: PlatformAuditService,
  ) {}

  /** `enabledOnly`: the tenant-facing read always passes `true`; the operator's own screen passes `false`. */
  list(enabledOnly: boolean): Promise<PlatformWallet[]> {
    return this.store.list(enabledOnly);
  }

  /** ADM-08: each change and its platform audit entry commit together or not at all. */
  create(values: NewPlatformWalletValues, operatorId: string): Promise<PlatformWallet> {
    return this.store.run(async (tx) => {
      const wallet = await this.store.create(tx, values);
      await this.platformAudit.recordWithin(tx, {
        actorType: PlatformActorType.Operator,
        actorId: operatorId,
        action: PlatformAuditAction.PlatformWalletAdded,
        targetType: 'platform_wallet',
        targetId: wallet.id,
        result: AuditResult.Success,
        ip: null,
        summary: { ...values },
      });
      return wallet;
    });
  }

  update(
    id: string,
    values: UpdatePlatformWalletValues,
    operatorId: string,
  ): Promise<PlatformWallet> {
    return this.store.run(async (tx) => {
      const wallet = await this.store.update(tx, id, values);
      if (!wallet) throw new ApiError('not_found', 'PlatformWalletNotFound', { id });
      await this.platformAudit.recordWithin(tx, {
        actorType: PlatformActorType.Operator,
        actorId: operatorId,
        action: PlatformAuditAction.PlatformWalletUpdated,
        targetType: 'platform_wallet',
        targetId: id,
        result: AuditResult.Success,
        ip: null,
        summary: { ...values },
      });
      return wallet;
    });
  }

  remove(id: string, operatorId: string): Promise<void> {
    return this.store.run(async (tx) => {
      await this.store.remove(tx, id);
      await this.platformAudit.recordWithin(tx, {
        actorType: PlatformActorType.Operator,
        actorId: operatorId,
        action: PlatformAuditAction.PlatformWalletRemoved,
        targetType: 'platform_wallet',
        targetId: id,
        result: AuditResult.Success,
        ip: null,
        summary: {},
      });
    });
  }
}
