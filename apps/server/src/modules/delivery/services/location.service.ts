import { Inject, Injectable } from '@nestjs/common';
import { ServerFieldProblemCode } from '@lytronix/validators';
import type { InvalidField } from '../../../common/api-error';
import type { LocationStore } from '../ports/delivery-stores';
import { LOCATION_STORE } from '../tokens';
import type {
  CityView,
  LocationList,
  LocationsView,
  ThanaView,
  ZillaView,
  ZoneAreas,
} from '../types/delivery';

/** The canonical list, indexed for lookups. */
interface LocationIndex {
  view: LocationsView;
  cities: Map<string, CityView>;
  zillas: Map<number, { id: number; nameEn: string; nameBn: string }>;
  thanas: Map<number, ThanaView & { zillaId: number }>;
}

function indexOf(list: LocationList): LocationIndex {
  const cities = new Map(
    list.cities.map((city): [string, CityView] => [
      city.code,
      { code: city.code, nameEn: city.nameEn, nameBn: city.nameBn },
    ]),
  );
  const thanas = new Map(
    list.locations.map((row): [number, ThanaView & { zillaId: number }] => [
      row.id,
      {
        id: row.id,
        zillaId: row.zillaId,
        nameEn: row.nameEn,
        nameBn: row.nameBn,
        cityCode: row.cityCode,
      },
    ]),
  );
  const zillas = new Map(
    list.zillas.map((zilla) => [
      zilla.id,
      { id: zilla.id, nameEn: zilla.nameEn, nameBn: zilla.nameBn },
    ]),
  );
  const view: LocationsView = {
    cities: [...cities.values()],
    zillas: list.zillas.map((zilla): ZillaView => ({
      id: zilla.id,
      nameEn: zilla.nameEn,
      nameBn: zilla.nameBn,
      thanas: [...thanas.values()]
        .filter((thana) => thana.zillaId === zilla.id)
        .map((thana) => ({
          id: thana.id,
          nameEn: thana.nameEn,
          nameBn: thana.nameBn,
          cityCode: thana.cityCode,
        })),
    })),
  };
  return { view, cities, zillas, thanas };
}

/**
 * CUS-08: the one canonical zilla and thana list every address form and delivery zone uses, the same for every shop
 * and never shaped by couriers. It changes only with a migration, so each process reads it once and keeps it.
 */
@Injectable()
export class LocationService {
  private loading: Promise<LocationIndex> | null = null;

  constructor(@Inject(LOCATION_STORE) private readonly store: LocationStore) {}

  async list(): Promise<LocationsView> {
    return (await this.index()).view;
  }

  async thana(id: number): Promise<(ThanaView & { zillaId: number }) | null> {
    return (await this.index()).thanas.get(id) ?? null;
  }

  /** Slice 4.8a: a thana and the zilla it is in, both named in each language -- an order row's "Mirpur, Dhaka". */
  async areaOf(thanaId: number): Promise<{
    thana: { id: number; nameEn: string; nameBn: string };
    zilla: { id: number; nameEn: string; nameBn: string };
  } | null> {
    const index = await this.index();
    const thana = index.thanas.get(thanaId);
    const zilla = thana ? index.zillas.get(thana.zillaId) : undefined;
    if (!thana || !zilla) return null;
    return {
      thana: { id: thana.id, nameEn: thana.nameEn, nameBn: thana.nameBn },
      zilla: { id: zilla.id, nameEn: zilla.nameEn, nameBn: zilla.nameBn },
    };
  }

  /** LND-16: the English name of the zilla a thana is in. */
  async zillaNameOf(thanaId: number): Promise<string | null> {
    const index = await this.index();
    const thana = index.thanas.get(thanaId);
    return thana ? (index.zillas.get(thana.zillaId)?.nameEn ?? null) : null;
  }

  /** The areas' names, for a zone's view; an id the list no longer has is left out. */
  async describe(areas: ZoneAreas): Promise<{
    zillas: { id: number; nameEn: string; nameBn: string }[];
    cities: CityView[];
    thanas: (ThanaView & { zillaId: number })[];
  }> {
    const index = await this.index();
    const present = <K, V>(map: Map<K, V>, keys: K[]): V[] =>
      keys.flatMap((key) => {
        const found = map.get(key);
        return found ? [found] : [];
      });
    return {
      zillas: present(index.zillas, areas.zillaIds),
      cities: present(index.cities, areas.cityCodes),
      thanas: present(index.thanas, areas.locationIds),
    };
  }

  /** DLV-01: each area named must exist in the canonical list; the refusal names each one that does not. */
  async problemsWith(areas: ZoneAreas, path = 'areas'): Promise<InvalidField[]> {
    const index = await this.index();
    const missing = <K>(field: string, keys: K[], has: (key: K) => boolean): InvalidField[] =>
      keys.flatMap((key, position) =>
        has(key)
          ? []
          : [
              {
                field: `${path}.${field}.${String(position)}`,
                problem: ServerFieldProblemCode.NotFound,
                messageKey: 'DeliveryAreaNotFound' as const,
              },
            ],
      );
    return [
      ...missing('zillaIds', areas.zillaIds, (id) => index.zillas.has(id)),
      ...missing('cityCodes', areas.cityCodes, (code) => index.cities.has(code)),
      ...missing('locationIds', areas.locationIds, (id) => index.thanas.has(id)),
    ];
  }

  private index(): Promise<LocationIndex> {
    // A failed read is not kept, so the next call tries again.
    this.loading ??= this.store
      .listAll()
      .then(indexOf)
      .catch((error: unknown) => {
        this.loading = null;
        throw error;
      });
    return this.loading;
  }
}
