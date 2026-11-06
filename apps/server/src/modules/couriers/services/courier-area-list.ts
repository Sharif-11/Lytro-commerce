import { Inject, Injectable, Logger } from '@nestjs/common';
import type { SelectCourierArea } from '@lytronix/db';
import {
  AuditResult,
  COURIER_AREA_SEARCH_MAX,
  CourierAreaMatch,
  PlatformActorType,
  PlatformAuditAction,
  type AssignCourierAreaInput,
  type ConfirmCourierAreasInput,
  type CourierAreasQuery,
  type CourierKey,
} from '@lytronix/validators';
import { ApiError } from '../../../common/api-error';
import { CircuitOpen } from '../../../common/circuit-breaker';
import { PlatformAuditService } from '../../audit/services/platform-audit.service';
import type { PlanOperator } from '../../billing/services/plans.service';
import { LocationService } from '../../delivery/services/location.service';
import { CourierNoAnswer, type CourierAdapter } from '../ports/courier-adapter';
import type { CourierAreaStore } from '../ports/courier-area-store';
import { COURIER_AREA_STORE, COURIER_AREA_TOKENS, COURIER_CLOCK } from '../tokens';
import { PlaceMatcher } from '../../delivery/services/place-matching';
import { CourierRegistry } from './courier-registry';

// A courier's token for its area list, by courier: Lytro's own account, never a shop's (read agreed 2026-11-06).
export type CourierAreaTokens = Partial<Record<CourierKey, string>>;

/** CUS-10: one area as the operator sees it. */
export interface CourierAreaView {
  id: string;
  courierKey: CourierKey;
  areaCode: string;
  name: string;
  districtName: string;
  postCode: string | null;
  zillaId: number | null;
  thanaId: number | null;
  suggestedThanaId: number | null;
  match: CourierAreaMatch;
  retiredAt: Date | null;
}

/** CUS-12: one area staff can choose. `suggested` is a match the operator hasn't confirmed. */
export interface CourierAreaChoice {
  areaCode: string;
  name: string;
  suggested: boolean;
}

export interface CourierAreaRefresh {
  listed: number;
  added: number;
  renamed: number;
  retired: number;
  back: number;
}

/** The order's place, for choosing its courier area. */
export interface OrderPlace {
  locationId: number | null;
}

function viewOf(row: SelectCourierArea): CourierAreaView {
  return {
    id: row.id,
    courierKey: row.courierKey,
    areaCode: row.areaCode,
    name: row.name,
    districtName: row.districtName,
    postCode: row.postCode,
    zillaId: row.zillaId,
    thanaId: row.thanaId,
    suggestedThanaId: row.suggestedThanaId,
    match: row.match,
    retiredAt: row.retiredAt,
  };
}

function choiceOf(row: SelectCourierArea): CourierAreaChoice {
  return {
    areaCode: row.areaCode,
    name: row.name,
    suggested: row.match === CourierAreaMatch.Suggested,
  };
}

/**
 * CUS-10, CUS-12, CRR-10 (Phase 6 Slice 6.4, read agreed 2026-11-06): couriers' own areas. The list is read with Lytro's own token once a
 * week and on the operator's word; new areas are matched to thanas, and what the operator placed is never undone. An area RedX stops
 * listing is retired. A booking picks the area by itself only where the order's thana has one area and it is named after the thana;
 * otherwise staff choose, from the thana's areas first, then by searching the order's zilla. An area is never sent from another zilla.
 */
@Injectable()
export class CourierAreaList {
  private readonly logger = new Logger('CourierAreas');

  constructor(
    @Inject(COURIER_AREA_STORE) private readonly store: CourierAreaStore,
    @Inject(CourierRegistry) private readonly registry: CourierRegistry,
    @Inject(LocationService) private readonly locations: LocationService,
    @Inject(PlatformAuditService) private readonly audit: PlatformAuditService,
    @Inject(COURIER_AREA_TOKENS) private readonly tokens: CourierAreaTokens,
    @Inject(COURIER_CLOCK) private readonly clock: () => Date,
  ) {}

  /** The couriers whose area lists can be read now. */
  refreshable(): CourierKey[] {
    return this.registry
      .all()
      .filter((adapter) => adapter.listAreas !== undefined && this.tokens[adapter.key])
      .map((adapter) => adapter.key);
  }

  /** CUS-10: reads the list again, by the weekly job (no operator) or on the operator's word. */
  async refresh(
    courierKey: CourierKey,
    operator: PlanOperator | null,
  ): Promise<CourierAreaRefresh> {
    const adapter = this.withAreas(courierKey);
    const listAreas = adapter.listAreas?.bind(adapter);
    const token = this.tokens[courierKey];
    if (!listAreas) throw new ApiError('not_found', 'CourierHasNoAreas', {});
    if (!token) {
      throw new ApiError('conflict', 'CourierAreasTokenMissing', { courierKey }, undefined, {
        courier: adapter.name,
      });
    }
    let answer: Awaited<ReturnType<typeof listAreas>>;
    try {
      answer = await listAreas({
        tenantId: '',
        connectionId: '',
        credentials: { apiToken: token },
      });
    } catch (error) {
      if (error instanceof CourierNoAnswer || error instanceof CircuitOpen) {
        throw new ApiError('service_unavailable', 'CourierNotAnswering', { courierKey }, 60, {
          courier: adapter.name,
        });
      }
      throw error;
    }
    if (answer.outcome === 'refused') {
      const { message } = answer.refusal;
      throw new ApiError(
        'conflict',
        message === null ? 'CourierRefusedNoReason' : 'CourierRefused',
        { courierKey, courierMessage: message },
        undefined,
        { courier: adapter.name, message: message ?? '' },
      );
    }
    // An empty answer would retire every area at once; that is a courier's fault, not its news.
    if (answer.areas.length === 0) {
      throw new ApiError('conflict', 'CourierAreasEmpty', { courierKey }, undefined, {
        courier: adapter.name,
      });
    }
    const known = new Set((await this.store.allOf(courierKey)).map((row) => row.areaCode));
    const matcher = new PlaceMatcher((await this.locations.list()).zillas);
    const added = answer.areas
      .filter((area) => !known.has(area.areaCode))
      .map((area) => ({ ...area, ...matcher.place(area) }));
    const kept = answer.areas.filter((area) => known.has(area.areaCode));
    const now = this.clock();
    const counts = await this.store.run(async (tx) => {
      const done = await this.store.refresh(tx, courierKey, { added, kept }, now);
      await this.audit.recordWithin(tx, {
        actorType: operator ? PlatformActorType.Operator : PlatformActorType.System,
        actorId: operator?.operatorId ?? null,
        action: PlatformAuditAction.CourierAreasRefreshed,
        targetType: 'courier',
        // The target column holds ids; the courier is named in the summary.
        targetId: null,
        result: AuditResult.Success,
        ip: operator?.ip ?? null,
        summary: { courierKey, listed: answer.areas.length, ...done },
      });
      return done;
    });
    this.logger.log(
      `${adapter.name}'s areas: ${String(answer.areas.length)} listed, ${String(counts.added)} new, ${String(counts.retired)} retired`,
    );
    return { listed: answer.areas.length, ...counts };
  }

  async list(query: CourierAreasQuery) {
    this.withAreas(query.courierKey);
    const found = await this.store.list(
      { courierKey: query.courierKey, state: query.state, zillaId: query.zillaId, q: query.q },
      { offset: (query.page - 1) * query.limit, limit: query.limit },
    );
    return {
      areas: found.rows.map(viewOf),
      page: query.page,
      limit: query.limit,
      total: found.total,
      pages: Math.ceil(found.total / query.limit),
    };
  }

  /** The operator placing an area in a thana, which then counts, or taking it off one. Its zilla follows the thana. */
  async assign(
    id: string,
    input: AssignCourierAreaInput,
    operator: PlanOperator,
  ): Promise<CourierAreaView> {
    const area = await this.store.findById(id);
    if (!area) throw new ApiError('not_found', 'CourierAreaNotFound', {});
    const thana = input.thanaId === null ? null : await this.locations.thana(input.thanaId);
    if (input.thanaId !== null && !thana) throw new ApiError('not_found', 'LocationNotFound', {});
    const now = this.clock();
    return this.store.run(async (tx) => {
      const row = await this.store.assign(
        tx,
        id,
        { thanaId: thana?.id ?? null, zillaId: thana?.zillaId ?? area.zillaId },
        now,
      );
      if (!row) throw new ApiError('not_found', 'CourierAreaNotFound', {});
      await this.audit.recordWithin(tx, {
        actorType: PlatformActorType.Operator,
        actorId: operator.operatorId,
        action: PlatformAuditAction.CourierAreaAssigned,
        targetType: 'courier_area',
        targetId: id,
        result: AuditResult.Success,
        ip: operator.ip,
        summary: {
          courierKey: row.courierKey,
          areaCode: row.areaCode,
          oldValue: area.thanaId,
          newValue: row.thanaId,
        },
      });
      return viewOf(row);
    });
  }

  /** Read agreed 2026-11-06: suggestions the operator agrees with, many at a time; only those still suggested change. */
  async confirm(
    input: ConfirmCourierAreasInput,
    operator: PlanOperator,
  ): Promise<{ confirmed: number }> {
    const now = this.clock();
    return this.store.run(async (tx) => {
      const rows = await this.store.confirm(tx, input.ids, now);
      await this.audit.recordWithin(tx, {
        actorType: PlatformActorType.Operator,
        actorId: operator.operatorId,
        action: PlatformAuditAction.CourierAreasConfirmed,
        targetType: 'courier_area',
        targetId: null,
        result: AuditResult.Success,
        ip: operator.ip,
        summary: { confirmed: rows.length, ids: rows.map((row) => row.id) },
      });
      return { confirmed: rows.length };
    });
  }

  /** CUS-12: what staff can choose for an order: its thana's areas, then a search of its zilla. */
  async forOrder(
    courierKey: CourierKey,
    order: OrderPlace,
    q: string | undefined,
  ): Promise<{ thana: CourierAreaChoice[]; zilla: CourierAreaChoice[] }> {
    this.withAreas(courierKey);
    const thana = order.locationId !== null ? await this.locations.thana(order.locationId) : null;
    if (!thana) return { thana: [], zilla: [] };
    const inThana = await this.store.inThana(courierKey, thana.id);
    const shown = new Set(inThana.map((row) => row.areaCode));
    const inZilla = await this.store.inZilla(courierKey, thana.zillaId, q, COURIER_AREA_SEARCH_MAX);
    return {
      thana: inThana.map(choiceOf),
      zilla: inZilla.filter((row) => !shown.has(row.areaCode)).map(choiceOf),
    };
  }

  /**
   * CUS-12, CRR-10, read agreed 2026-11-06: the area a booking sends. Given one, it must be live and in the order's zilla. Not given, the
   * thana's only area is used when it is named after the thana; anything else asks staff to choose. A guessed area is never sent.
   */
  async choose(
    adapter: CourierAdapter,
    order: OrderPlace,
    areaCode: string | undefined,
  ): Promise<{ areaCode: string; name: string }> {
    const thana = order.locationId !== null ? await this.locations.thana(order.locationId) : null;
    const needed = () =>
      new ApiError('conflict', 'CourierAreaNeeded', { courierKey: adapter.key }, undefined, {
        courier: adapter.name,
      });
    if (areaCode !== undefined) {
      const area = await this.store.findByCode(adapter.key, areaCode);
      if (!area || area.retiredAt !== null || !thana || area.zillaId !== thana.zillaId) {
        throw new ApiError(
          'conflict',
          'CourierAreaNotFound',
          { courierKey: adapter.key },
          undefined,
          {
            courier: adapter.name,
          },
        );
      }
      return { areaCode: area.areaCode, name: area.name };
    }
    if (!thana) throw needed();
    const inThana = await this.store.inThana(adapter.key, thana.id);
    const [only] = inThana;
    if (inThana.length === 1 && only?.match === CourierAreaMatch.OwnName) {
      return { areaCode: only.areaCode, name: only.name };
    }
    throw needed();
  }

  private withAreas(courierKey: CourierKey): CourierAdapter {
    const adapter = this.registry.of(courierKey);
    if (!adapter?.needsArea) throw new ApiError('not_found', 'CourierHasNoAreas', {});
    return adapter;
  }
}
