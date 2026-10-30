import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Transaction } from '@lytronix/db';
import {
  ActorType,
  AuditAction,
  CUSTOM_DOMAIN_FEATURE,
  DomainStatus,
  FieldProblemCode,
  ServerFieldProblemCode,
  domainTwinOf,
  featureOn,
  normalizeDomain,
  type AddDomainInput,
} from '@lytronix/validators';
import { ApiError, FieldsError } from '../../../common/api-error';
import { UniqueViolation } from '../../../common/errors/unique-violation';
import { CatalogueActivity, type ResolvedActor } from '../../catalogue/services/catalogue-activity';
import type { CatalogueActor } from '../../catalogue/types/catalogue';
import { HostClassifier } from '../../tenancy/services/host-classifier';
import { TenantCache } from '../../tenancy/services/tenant-cache';
import type { DomainStore } from '../ports/domain-store';
import { DOMAIN_STORE } from '../tokens';
import type { DomainRow, DomainState, DomainView } from '../types/domain';
import { domainCheckDue, domainCheckOutcome } from './domain-checks';
import { DomainRecords } from './domain-records';
import { DomainVerifier } from './domain-verifier';

// The recurring check acts for no one: its entries are the system's.
const SYSTEM: ResolvedActor = { id: null, ip: null, type: ActorType.System };

/** The shop a domain is for: its id, and its address, which the domain's records must name. */
export interface DomainShop {
  id: string;
  slug: string;
}

/** What one run of the recurring check did. */
export interface DomainCheckRun {
  checked: number;
  activated: number;
  failed: number;
  lost: number;
}

/**
 * TEN-09 to TEN-14, DWN-10 (Slice 13, its read agreed 2026-10-30): a Growth or Pro shop's own domain. Added, it waits
 * for its records, checked at once and then every 10 minutes for 72 hours; verified, it is the shop's main address,
 * rechecked daily, and two checks running without its record send it back to waiting. It serves only while the shop's
 * plan (or an add-on) includes it, checked on every read, so a downgrade turns it off at once and keeps it (DWN-10).
 */
@Injectable()
export class DomainService {
  private readonly logger = new Logger('Domains');

  constructor(
    @Inject(DOMAIN_STORE) private readonly store: DomainStore,
    @Inject(DomainVerifier) private readonly verifier: DomainVerifier,
    @Inject(DomainRecords) private readonly records: DomainRecords,
    @Inject(HostClassifier) private readonly hosts: HostClassifier,
    @Inject(TenantCache) private readonly cache: TenantCache,
    @Inject(CatalogueActivity) private readonly activity: CatalogueActivity,
  ) {}

  /** The Domain page's read: whether the plan includes a domain, and the shop's domain with its records. */
  view(shop: DomainShop): Promise<DomainView> {
    return this.store.run((tx) => this.viewIn(tx, shop));
  }

  /** TEN-09, TEN-10, TEN-12: adds the shop's domain, waiting for its records, and checks it once straight away. */
  async add(shop: DomainShop, input: AddDomainInput, actor: CatalogueActor): Promise<DomainView> {
    const who = await this.activity.resolve(shop.id, actor);
    const added = await this.store.run(async (tx) => {
      if (!(await this.allowed(tx, shop.id))) {
        throw new ApiError('plan_feature_unavailable', 'DomainNeedsPlan');
      }
      const hostname = this.hostnameOf(input.hostname);
      if (await this.store.current(tx, shop.id)) throw new ApiError('conflict', 'DomainAlreadySet');
      if ((await this.store.activeOwner(tx, hostname)) !== null) {
        throw new FieldsError(
          [{ field: 'hostname', problem: ServerFieldProblemCode.Taken, messageKey: 'DomainTaken' }],
          'conflict',
        );
      }
      const row = await this.insert(tx, {
        tenantId: shop.id,
        hostname,
        twin: domainTwinOf(hostname),
      });
      await this.record(tx, shop.id, who, AuditAction.DomainAdded, row);
      return row;
    });
    await this.checkOne(added, shop.slug, new Date());
    return this.view(shop);
  }

  /**
   * TEN-11: "Check now" -- asks DNS at once for a waiting domain, or for one that could not be verified, which starts its
   * 72 hours over. An active domain is left to its daily check.
   */
  async check(shop: DomainShop): Promise<DomainView> {
    const now = new Date();
    const row = await this.store.run(async (tx) => {
      const current = await this.store.current(tx, shop.id);
      if (!current) throw new ApiError('not_found', 'DomainNotSet');
      if (current.status !== DomainStatus.Failed) return current;
      return this.store.update(tx, current.id, {
        status: DomainStatus.Pending,
        pendingSince: now,
        missedChecks: 0,
      });
    });
    if (row.status === DomainStatus.Pending) await this.checkOne(row, shop.slug, now);
    return this.view(shop);
  }

  /** TEN-14: the shop stops answering on its domain at once; its own address keeps working. */
  async remove(shop: DomainShop, actor: CatalogueActor): Promise<DomainView> {
    const who = await this.activity.resolve(shop.id, actor);
    const view = await this.store.run(async (tx) => {
      const current = await this.store.current(tx, shop.id);
      if (!current) throw new ApiError('not_found', 'DomainNotSet');
      await this.store.update(tx, current.id, {
        status: DomainStatus.Removed,
        removedAt: new Date(),
        twinActive: false,
      });
      await this.record(tx, shop.id, who, AuditAction.DomainRemoved, current);
      return this.viewIn(tx, shop);
    });
    this.cache.invalidateTenant(shop.id); // TEN-27: within 5 seconds, not the cache's own minute.
    return view;
  }

  /**
   * The shop's main address when its own domain serves -- active, and its plan includes it -- or null for its own
   * address on the platform. The storefront leads there, and share links and the dashboard's shop link use it.
   */
  servingHost(tenantId: string): Promise<string | null> {
    return this.store.run(async (tx) => {
      const current = await this.store.current(tx, tenantId);
      if (current?.status !== DomainStatus.Active) return null;
      return (await this.allowed(tx, tenantId)) ? current.hostname : null;
    });
  }

  /** TEN-11: the recurring check over every waiting domain, and every active one due its daily check. */
  async runChecks(now: Date): Promise<DomainCheckRun> {
    const run: DomainCheckRun = { checked: 0, activated: 0, failed: 0, lost: 0 };
    for (const domain of await this.store.listToCheck()) {
      if (!domainCheckDue(domain, now)) continue;
      try {
        const status = await this.checkOne(domain, domain.slug, now);
        run.checked += 1;
        if (status === domain.status) continue;
        if (status === DomainStatus.Active) run.activated += 1;
        else if (status === DomainStatus.Failed) run.failed += 1;
        else if (status === DomainStatus.Pending) run.lost += 1;
      } catch (error) {
        // TEN-07: one shop's failure never stops the others' checks; the next run tries it again.
        this.logger.warn(`domain check failed for ${domain.hostname}: ${String(error)}`);
      }
    }
    return run;
  }

  /** One check of one domain: DNS first, outside any transaction, then its outcome written. Returns its status after. */
  private async checkOne(domain: DomainRow, slug: string, now: Date): Promise<DomainStatus> {
    const answer = await this.verifier.domain(domain.hostname, slug);
    const twin =
      answer === 'found' ? await this.verifier.twin(domain.twin, domain.hostname, slug) : 'missing';
    const result = await this.store.run(async (tx) => {
      // Removed, or removed and added again, while DNS was asked: this check is no longer its to write.
      const current = await this.store.current(tx, domain.tenantId);
      if (current?.id !== domain.id) return null;
      const outcome = domainCheckOutcome(current, answer, twin, now);
      if (outcome.event === AuditAction.DomainActivated) {
        const owner = await this.store.activeOwner(tx, current.hostname);
        if (owner !== null && owner !== current.tenantId)
          return { status: current.status, outcome: null };
      }
      if (outcome.patch.twinActive === true) {
        const twinOwner = await this.store.activeOwner(tx, current.twin);
        if (twinOwner !== null && twinOwner !== current.tenantId) outcome.patch.twinActive = false;
      }
      const updated = await this.store.update(tx, current.id, outcome.patch);
      if (outcome.event) {
        await this.record(tx, current.tenantId, SYSTEM, outcome.event, updated);
      }
      return { status: updated.status, outcome };
    });
    if (result?.outcome?.servingChanged) this.cache.invalidateTenant(domain.tenantId);
    return result?.status ?? domain.status;
  }

  private async viewIn(tx: Transaction, shop: DomainShop): Promise<DomainView> {
    const allowed = await this.allowed(tx, shop.id);
    const current = await this.store.current(tx, shop.id);
    if (!current) return { allowed, domain: null };
    return {
      allowed,
      domain: {
        hostname: current.hostname,
        twin: current.twin,
        state: this.stateOf(current, allowed),
        lost: current.status === DomainStatus.Pending && current.lostAt !== null,
        twinActive: current.twinActive,
        records: this.records.forDomain(current.hostname, shop.slug),
        twinRecords: this.records.forTwin(current.twin, shop.slug),
        addedAt: current.createdAt.toISOString(),
        checkedAt: current.checkedAt?.toISOString() ?? null,
        verifiedAt: current.verifiedAt?.toISOString() ?? null,
      },
    };
  }

  private stateOf(domain: DomainRow, allowed: boolean): DomainState {
    if (domain.status === DomainStatus.Active) return allowed ? 'active' : 'off';
    return domain.status === DomainStatus.Failed ? 'failed' : 'pending';
  }

  /** TEN-10, PYG-07: the plan's features or an add-on include the shop's own domain. */
  private async allowed(tx: Transaction, tenantId: string): Promise<boolean> {
    return featureOn(CUSTOM_DOMAIN_FEATURE, await this.store.holdings(tx, tenantId));
  }

  /** What the seller typed as one hostname: a domain, and not one of the platform's own addresses. */
  private hostnameOf(typed: string): string {
    const hostname = normalizeDomain(typed);
    if (hostname === null) {
      throw new FieldsError([
        { field: 'hostname', problem: FieldProblemCode.InvalidFormat, messageKey: 'DomainFormat' },
      ]);
    }
    if (this.hosts.classify(hostname).kind !== 'custom') {
      throw new FieldsError([
        { field: 'hostname', problem: FieldProblemCode.NotAllowed, messageKey: 'DomainIsLytro' },
      ]);
    }
    return hostname;
  }

  private async insert(
    tx: Transaction,
    values: { tenantId: string; hostname: string; twin: string },
  ): Promise<DomainRow> {
    try {
      return await this.store.insert(tx, values);
    } catch (error) {
      if (error instanceof UniqueViolation) throw new ApiError('conflict', 'DomainAlreadySet');
      throw error;
    }
  }

  private record(
    tx: Transaction,
    tenantId: string,
    who: ResolvedActor,
    action: AuditAction,
    domain: DomainRow,
  ): Promise<void> {
    return this.activity.record(
      tx,
      tenantId,
      who,
      action,
      { type: 'domain', id: domain.id },
      { hostname: domain.hostname },
    );
  }
}
