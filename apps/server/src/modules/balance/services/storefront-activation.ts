import { Inject, Injectable } from '@nestjs/common';
import type { Transaction } from '@lytronix/db';
import { toPaisa } from './money';
import { FairUseSwitch } from '../../fair-use/services/fair-use-switch';
import { EdgePurges } from '../../shared/edge-cache/services/edge-purges';
import { TenantService } from '../../tenancy/services/tenant.service';

/**
 * PYG-25 (PAYG-FAIR-USE-PLAN PF-13, PF-35): a pay-as-you-go shop's storefront, landing pages and public key open once
 * the shop has paid -- a plan, or one top-up of the activation amount (৳10). Marked as the payment is credited, whatever
 * the switch says, so a shop that pays before fair use is on is never paused by it. With the switch on, the shop's
 * cached pages are purged as it activates, and as it pauses, so neither the paused page nor a page from before stays.
 */
@Injectable()
export class StorefrontActivation {
  constructor(
    @Inject(TenantService) private readonly tenants: TenantService,
    @Inject(FairUseSwitch) private readonly fairUse: FairUseSwitch,
    @Inject(EdgePurges) private readonly purges: EdgePurges,
  ) {}

  /** A top-up credited: it activates the storefront when it is at least the activation amount. */
  async toppedUpWithin(
    tx: Transaction,
    tenantId: string,
    credited: string,
    at: Date,
  ): Promise<void> {
    const minimum = await this.fairUse.activationTopUp();
    if (toPaisa(credited) < toPaisa(String(minimum))) return;
    await this.activateWithin(tx, tenantId, at);
  }

  /** A plan bought, renewed or upgraded: the storefront is activated for good. */
  async planPaidWithin(tx: Transaction, tenantId: string, at: Date): Promise<void> {
    await this.activateWithin(tx, tenantId, at);
  }

  /**
   * PF-13, PF-35: the shop has just become pay-as-you-go. Unless it paid already, its pages pause; those Cloudflare and
   * the storefront kept are purged so the paused page answers at once.
   */
  async becamePayAsYouGoWithin(
    tx: Transaction,
    tenantId: string,
    activatedAt: Date | null,
  ): Promise<void> {
    if (activatedAt !== null || !(await this.fairUse.isOn())) return;
    await this.purges.shop(tx, tenantId);
  }

  /**
   * PFQ-9: the shops that paid before fair use was switched on, marked activated, so the switch pauses only those that
   * never paid. Can run any number of times.
   */
  async markPaidShopsWithin(tx: Transaction, at: Date): Promise<number> {
    const marked = await this.tenants.markPaidShopsActivated(
      tx,
      await this.fairUse.activationTopUp(),
      at,
    );
    return marked.length;
  }

  private async activateWithin(tx: Transaction, tenantId: string, at: Date): Promise<void> {
    const marked = await this.tenants.markStorefrontActivated(tx, tenantId, at);
    if (marked && (await this.fairUse.isOn())) await this.purges.shop(tx, tenantId);
  }
}
