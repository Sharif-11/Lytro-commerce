import type {
  CourierAreaFilter,
  CourierAreaRefreshCounts,
  CourierAreaSummary,
  ListedCourierArea,
  MatchedCourierArea,
  SelectCourierArea,
  Transaction,
} from '@lytronix/db';
import type { CourierKey } from '@lytronix/validators';

/** CUS-10 (Phase 6 Slice 6.4): couriers' area lists, platform-wide, with no tenant context. */
export interface CourierAreaStore {
  run<T>(work: (tx: Transaction) => Promise<T>): Promise<T>;
  list(
    filter: CourierAreaFilter,
    window: { offset: number; limit: number },
  ): Promise<{ rows: SelectCourierArea[]; total: number }>;
  summary(courierKey: CourierKey): Promise<CourierAreaSummary>;
  findById(id: string): Promise<SelectCourierArea | null>;
  findByCode(courierKey: CourierKey, areaCode: string): Promise<SelectCourierArea | null>;
  inThana(courierKey: CourierKey, thanaId: number): Promise<SelectCourierArea[]>;
  inZilla(
    courierKey: CourierKey,
    zillaId: number,
    q: string | undefined,
    limit: number,
  ): Promise<SelectCourierArea[]>;
  allOf(courierKey: CourierKey): Promise<SelectCourierArea[]>;
  refresh(
    tx: Transaction,
    courierKey: CourierKey,
    listed: { added: MatchedCourierArea[]; kept: ListedCourierArea[] },
    now: Date,
  ): Promise<CourierAreaRefreshCounts>;
  assign(
    tx: Transaction,
    id: string,
    place: { thanaId: number | null; zillaId: number | null },
    now: Date,
  ): Promise<SelectCourierArea | null>;
  confirm(tx: Transaction, ids: string[], now: Date): Promise<SelectCourierArea[]>;
}
