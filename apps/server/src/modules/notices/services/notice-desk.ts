import { Inject, Injectable } from '@nestjs/common';
import type { InsertNotice, SelectNotice, Transaction } from '@lytronix/db';
import {
  AuditResult,
  FieldProblemCode,
  NoticeAudienceKind,
  noticeProblems,
  PlatformActorType,
  PlatformAuditAction,
  renderNoticeMarkdown,
  ServerFieldProblemCode,
  type NoticeAudience,
  type NoticeCreateInput,
  type NoticesQuery,
  type NoticeTemplateInput,
  type NoticeUpdateInput,
} from '@lytronix/validators';
import { ApiError, FieldsError, type InvalidField } from '../../../common/api-error';
import { PlatformAuditService } from '../../audit/services/platform-audit.service';
import { NOTICE_TEMPLATES, type NoticeDraft } from '../notice-words';
import type { NoticeStore } from '../ports/notice-store';
import { NOTICE_STORE, NOTICES_CLOCK } from '../tokens';
import {
  noticeSnapshot,
  noticeStatus,
  type NoticeAcknowledgmentList,
  type OperatorNoticeDetail,
  type OperatorNoticeView,
} from '../types/notice';

/** NTC-05: the most shops each side of the acknowledgment list shows; the counts cover them all. */
const ACKNOWLEDGMENT_LIST_MAX = 500;

/** Who is acting in the console, and from where (ADM-08). */
export interface NoticeOperator {
  operatorId: string;
  ip: string | null;
}

/**
 * NTC-01, NTC-05, NTC-08, NTC-09, NTC-10, NTC-12, NTC-13, NTC-17 (Phase 7 Slice 7.4): the operator's side of notices --
 * write one (a draft until it has a publish time), edit it (once it is live, the earlier version is kept and the board
 * says "updated"; nothing is sent again), withdraw it, see what came of it, and start one from a template. Each change
 * is written to the platform audit log in its own transaction.
 */
@Injectable()
export class NoticeDesk {
  constructor(
    @Inject(NOTICE_STORE) private readonly store: NoticeStore,
    @Inject(NOTICES_CLOCK) private readonly clock: () => Date,
    @Inject(PlatformAuditService) private readonly platformAudit: PlatformAuditService,
  ) {}

  async list(query: NoticesQuery): Promise<{ items: OperatorNoticeView[]; next: number | null }> {
    const rows = await this.store.operatorList({
      category: query.category,
      q: query.q,
      limit: query.limit + 1,
      offset: query.offset,
    });
    const now = this.clock();
    return {
      items: rows.slice(0, query.limit).map(({ notice, counts }) => this.view(notice, counts, now)),
      next: rows.length > query.limit ? query.offset + query.limit : null,
    };
  }

  async detail(id: string): Promise<OperatorNoticeDetail> {
    const notice = await this.store.findById(id);
    if (!notice) throw new ApiError('not_found', 'NoticeNotFound', {});
    const [counts, versions] = await Promise.all([
      this.store.countsOf(id),
      this.store.versions(id),
    ]);
    return {
      ...this.view(notice, counts, this.clock()),
      versions: versions.map((version) => ({
        editedBy: version.editedBy,
        replacedAt: version.createdAt,
        snapshot: version.snapshot,
      })),
    };
  }

  /** NTC-01: a new notice, a draft unless it names a publish time. */
  async create(input: NoticeCreateInput, operator: NoticeOperator): Promise<OperatorNoticeView> {
    await this.refuseMissing(input);
    const row: InsertNotice = {
      titleBn: input.titleBn ?? null,
      titleEn: input.titleEn ?? null,
      bodyBn: input.bodyBn ?? null,
      bodyEn: input.bodyEn ?? null,
      category: input.category,
      severity: input.severity,
      audience: input.audience,
      publishAt: input.publishAt ?? null,
      endsAt: input.endsAt ?? null,
      pinned: input.pinned ?? false,
      requiresAck: input.requiresAck ?? false,
      windowStartsAt: input.windowStartsAt ?? null,
      windowEndsAt: input.windowEndsAt ?? null,
      rateChangeId: input.rateChangeId ?? null,
      createdBy: operator.operatorId,
    };
    const created = await this.store.run(async (tx) => {
      const notice = await this.store.create(tx, row);
      await this.record(tx, operator, PlatformAuditAction.NoticeCreated, notice, {
        category: notice.category,
        severity: notice.severity,
        audience: notice.audience,
        publishAt: notice.publishAt,
      });
      return notice;
    });
    return this.view(created, { shops: 0, people: 0, reads: 0, acknowledged: 0 }, this.clock());
  }

  /**
   * NTC-08: a change to a notice. Once it is live its publish time stays, the version it replaces is kept, and the board
   * marks it "updated"; the shops already told aren't told again. A withdrawn notice can't change.
   */
  async edit(
    id: string,
    input: NoticeUpdateInput,
    operator: NoticeOperator,
  ): Promise<OperatorNoticeView> {
    await this.refuseMissing(input);
    const now = this.clock();
    const edited = await this.store.run(async (tx) => {
      const current = await this.store.lockById(tx, id);
      if (!current) throw new ApiError('not_found', 'NoticeNotFound', {});
      if (current.withdrawnAt) throw new ApiError('conflict', 'NoticeWithdrawnAlready', {});
      const live = current.publishAt !== null && current.publishAt <= now;
      if (
        live &&
        input.publishAt !== undefined &&
        input.publishAt?.getTime() !== current.publishAt?.getTime()
      ) {
        throw new FieldsError([
          {
            field: 'publishAt',
            problem: FieldProblemCode.NotAllowed,
            messageKey: 'NoticePublishTimeFixed',
          },
        ]);
      }
      const change = this.changeOf(input);
      const merged = { ...current, ...change };
      const problems = noticeProblems(merged);
      if (problems.length > 0) {
        throw new FieldsError(
          problems.map(({ path, problem }) => ({ field: path.join('.'), problem })),
        );
      }
      if (live) await this.store.addVersion(tx, id, noticeSnapshot(current), operator.operatorId);
      const notice = await this.store.update(tx, id, live ? { ...change, editedAt: now } : change);
      await this.record(tx, operator, PlatformAuditAction.NoticeEdited, notice, {
        fields: Object.keys(change),
        live,
      });
      return notice;
    });
    return this.view(edited, await this.store.countsOf(id), now);
  }

  /** NTC-08: hidden from every shop at once, kept here with its history. Withdrawn twice, the first stands. */
  async withdraw(id: string, operator: NoticeOperator): Promise<OperatorNoticeView> {
    const now = this.clock();
    const withdrawn = await this.store.run(async (tx) => {
      const current = await this.store.lockById(tx, id);
      if (!current) throw new ApiError('not_found', 'NoticeNotFound', {});
      if (current.withdrawnAt) return current;
      const notice = await this.store.update(tx, id, {
        withdrawnAt: now,
        withdrawnBy: operator.operatorId,
      });
      await this.record(tx, operator, PlatformAuditAction.NoticeWithdrawn, notice, {
        status: noticeStatus(current, now),
      });
      return notice;
    });
    return this.view(withdrawn, await this.store.countsOf(id), now);
  }

  /** NTC-05: the shops in its audience now that said "I understand", and those still to. */
  async acknowledgments(id: string): Promise<NoticeAcknowledgmentList> {
    const notice = await this.store.findById(id);
    if (!notice) throw new ApiError('not_found', 'NoticeNotFound', {});
    const [acknowledged, pending, pendingCount, counts] = await Promise.all([
      this.store.acknowledgments(id, ACKNOWLEDGMENT_LIST_MAX),
      this.store.audienceShops(notice, 'acknowledged', ACKNOWLEDGMENT_LIST_MAX),
      this.store.audienceCount(notice, 'acknowledged'),
      this.store.countsOf(id),
    ]);
    return { acknowledged, pending, acknowledgedCount: counts.acknowledged, pendingCount };
  }

  /**
   * NTC-12, NTC-13: a template filled in. Given a rate change, the rate, its old and new values and the day come from
   * the change itself, and the notice carries the change so publishing it links the two (RAT-09).
   */
  async template(input: NoticeTemplateInput): Promise<NoticeDraft> {
    const variables = input.variables;
    let rate = {
      key: variables.rateKey ?? null,
      oldValue: variables.oldRate ?? null,
      newValue: variables.newRate ?? null,
    };
    let date = variables.date ?? null;
    if (variables.rateChangeId !== undefined) {
      const change = await this.store.rateChange(variables.rateChangeId);
      if (!change) {
        throw new FieldsError([
          {
            field: 'variables.rateChangeId',
            problem: ServerFieldProblemCode.NotFound,
            messageKey: 'RateChangeNotFound',
          },
        ]);
      }
      rate = { key: change.key, oldValue: change.oldValue, newValue: change.newValue };
      date = date ?? change.changedAt;
    }
    return NOTICE_TEMPLATES[input.template]({
      date,
      rate,
      windowStartsAt: variables.windowStartsAt ?? null,
      windowEndsAt: variables.windowEndsAt ?? null,
      rateChangeId: variables.rateChangeId ?? null,
    });
  }

  /** NTC-02, NTC-13: a notice names only plans, shops and rate changes that exist. */
  private async refuseMissing(input: {
    audience?: NoticeAudience | undefined;
    rateChangeId?: number | null | undefined;
  }): Promise<void> {
    const fields: InvalidField[] = [];
    const audience = input.audience;
    if (
      audience?.kind === NoticeAudienceKind.Plans &&
      !(await this.store.plansExist(audience.planIds))
    ) {
      fields.push({
        field: 'audience.planIds',
        problem: ServerFieldProblemCode.NotFound,
        messageKey: 'NoticePlanNotFound',
      });
    }
    if (
      audience?.kind === NoticeAudienceKind.Tenant &&
      !(await this.store.shopExists(audience.tenantId))
    ) {
      fields.push({
        field: 'audience.tenantId',
        problem: ServerFieldProblemCode.NotFound,
        messageKey: 'NoticeShopNotFound',
      });
    }
    if (input.rateChangeId && !(await this.store.rateChange(input.rateChangeId))) {
      fields.push({
        field: 'rateChangeId',
        problem: ServerFieldProblemCode.NotFound,
        messageKey: 'RateChangeNotFound',
      });
    }
    if (fields.length > 0) throw new FieldsError(fields);
  }

  /** The columns an edit sets: only the fields it names; a null clears an optional one. */
  private changeOf(input: NoticeUpdateInput): Partial<InsertNotice> {
    const change: Partial<InsertNotice> = {};
    if (input.titleBn !== undefined) change.titleBn = input.titleBn;
    if (input.titleEn !== undefined) change.titleEn = input.titleEn;
    if (input.bodyBn !== undefined) change.bodyBn = input.bodyBn;
    if (input.bodyEn !== undefined) change.bodyEn = input.bodyEn;
    if (input.category !== undefined) change.category = input.category;
    if (input.severity !== undefined) change.severity = input.severity;
    if (input.audience !== undefined) change.audience = input.audience;
    if (input.publishAt !== undefined) change.publishAt = input.publishAt;
    if (input.endsAt !== undefined) change.endsAt = input.endsAt;
    if (input.pinned !== undefined) change.pinned = input.pinned;
    if (input.requiresAck !== undefined) change.requiresAck = input.requiresAck;
    if (input.windowStartsAt !== undefined) change.windowStartsAt = input.windowStartsAt;
    if (input.windowEndsAt !== undefined) change.windowEndsAt = input.windowEndsAt;
    if (input.rateChangeId !== undefined) change.rateChangeId = input.rateChangeId;
    return change;
  }

  private record(
    tx: Transaction,
    operator: NoticeOperator,
    action: PlatformAuditAction,
    notice: SelectNotice,
    summary: Record<string, unknown>,
  ): Promise<void> {
    return this.platformAudit.recordWithin(tx, {
      actorType: PlatformActorType.Operator,
      actorId: operator.operatorId,
      action,
      targetType: 'notice',
      targetId: notice.id,
      result: AuditResult.Success,
      ip: operator.ip,
      summary: { title: notice.titleEn ?? notice.titleBn, ...summary },
    });
  }

  private view(
    notice: SelectNotice,
    counts: OperatorNoticeView['counts'],
    now: Date,
  ): OperatorNoticeView {
    return {
      id: notice.id,
      titleBn: notice.titleBn,
      titleEn: notice.titleEn,
      bodyBn: notice.bodyBn,
      bodyEn: notice.bodyEn,
      htmlBn: notice.bodyBn === null ? null : renderNoticeMarkdown(notice.bodyBn),
      htmlEn: notice.bodyEn === null ? null : renderNoticeMarkdown(notice.bodyEn),
      category: notice.category,
      severity: notice.severity,
      audience: notice.audience,
      publishAt: notice.publishAt,
      endsAt: notice.endsAt,
      pinned: notice.pinned,
      requiresAck: notice.requiresAck,
      windowStartsAt: notice.windowStartsAt,
      windowEndsAt: notice.windowEndsAt,
      rateChangeId: notice.rateChangeId,
      status: noticeStatus(notice, now),
      createdBy: notice.createdBy,
      createdAt: notice.createdAt,
      editedAt: notice.editedAt,
      withdrawnAt: notice.withdrawnAt,
      sentAt: notice.sentAt,
      counts,
    };
  }
}
