import { NOW } from './console-data';

type Row = Record<string, unknown>;

export interface PricingState {
  plans: Row[];
  planVersions: Record<string, Row[]>;
  terms: Row[];
  prices: { planId: string; billingTermId: string; price: string }[];
  rates: Row[];
  rateHistory: Record<string, Row[]>;
  settings: Row[];
  wallets: Row[];
  catalogueAddons: Row[];
  presets: Row[];
  attributes: Row[];
  optionSets: Row[];
}

type Answer = { data: unknown } | { refused: [number, string, string] };

const OK: Answer = { data: { ok: true } };
let nextId = 1000;
const newId = (prefix: string): string => {
  nextId += 1;
  return `${prefix}-${String(nextId)}`;
};

function update(rows: Row[], id: unknown, patch: Row, by = 'id'): Row | undefined {
  const row = rows.find((each) => each[by] === id);
  if (row) Object.assign(row, patch);
  return row;
}

function plansAnswer(
  method: string,
  path: string,
  body: Row | null,
  state: PricingState,
): Answer | undefined {
  if (path === '/operator/plans') {
    if (method === 'GET') return { data: state.plans };
    const created = {
      description: null,
      features: {},
      ...body,
      id: newId('plan'),
      version: 1,
      createdAt: NOW,
      shopsByVersion: [],
      deletable: true,
    };
    state.plans.push(created);
    return { data: created };
  }
  const versions = /^\/operator\/plans\/([^/]+)\/versions$/.exec(path);
  if (versions) return { data: state.planVersions[versions[1] ?? ''] ?? [] };
  const price = /^\/operator\/plans\/([^/]+)\/prices\/([^/]+)$/.exec(path);
  if (price) {
    const [, planId = '', billingTermId = ''] = price;
    state.prices = state.prices.filter(
      (each) => each.planId !== planId || each.billingTermId !== billingTermId,
    );
    if (method === 'PUT') {
      state.prices.push({
        planId,
        billingTermId,
        price: `${String(body?.price)}.00`,
      });
    }
    return OK;
  }
  const one = /^\/operator\/plans\/([^/]+)$/.exec(path);
  if (!one) return undefined;
  const plan = state.plans.find((each) => each.id === one[1]);
  if (!plan) return { refused: [404, 'not_found', 'This plan was not found.'] };
  if (method === 'DELETE') {
    if (!plan.deletable) return { refused: [409, 'conflict', 'This plan is still in use.'] };
    state.plans = state.plans.filter((each) => each !== plan);
    return OK;
  }
  (state.planVersions[String(plan.id)] ??= []).push({
    ...plan,
    id: newId('pv'),
    planId: plan.id,
    recordedAt: NOW,
  });
  Object.assign(plan, body, { version: Number(plan.version) + 1 });
  return { data: plan };
}

function termsAnswer(
  method: string,
  path: string,
  body: Row | null,
  state: PricingState,
): Answer | undefined {
  if (path === '/operator/billing-terms/prices') return { data: state.prices };
  if (path === '/operator/billing-terms') {
    if (method === 'GET') return { data: state.terms };
    const created = {
      visible: true,
      displayOrder: 0,
      defaultDiscountPct: null,
      tenantId: null,
      ...body,
      ...(body?.defaultDiscountPct === undefined
        ? {}
        : { defaultDiscountPct: Number(body.defaultDiscountPct).toFixed(2) }),
      id: newId('term'),
      retiredAt: null,
      createdAt: NOW,
      invoices: 0,
      deletable: true,
    };
    state.terms.push(created);
    return { data: created };
  }
  const retired = /^\/operator\/billing-terms\/([^/]+)\/retire$/.exec(path);
  if (retired) return { data: update(state.terms, retired[1], { retiredAt: NOW, visible: false }) };
  const one = /^\/operator\/billing-terms\/([^/]+)$/.exec(path);
  if (!one) return undefined;
  if (method === 'DELETE') {
    const term = state.terms.find((each) => each.id === one[1]);
    if (!term?.deletable) return { refused: [409, 'conflict', 'This term is still in use.'] };
    state.terms = state.terms.filter((each) => each !== term);
    return OK;
  }
  const patch: Row = { ...body };
  if (body?.defaultDiscountPct !== undefined) {
    patch.defaultDiscountPct = Number(body.defaultDiscountPct).toFixed(2);
  }
  return { data: update(state.terms, one[1], patch) };
}

function ratesAnswer(
  method: string,
  path: string,
  body: Row | null,
  state: PricingState,
): Answer | undefined {
  if (path === '/operator/rates') return { data: state.rates };
  const history = /^\/operator\/rates\/([^/]+)\/history$/.exec(path);
  if (history) return { data: state.rateHistory[history[1] ?? ''] ?? [] };
  const one = /^\/operator\/rates\/([^/]+)$/.exec(path);
  if (!one || method !== 'PATCH') return undefined;
  const key = one[1] ?? '';
  const rate = state.rates.find((each) => each.key === key);
  const newValue = Number(body?.value).toFixed(2);
  // NTC-13 (Slice 7.7): the save answers the history row's id, which a notice of the change names.
  const id = Number(newId('').slice(1));
  (state.rateHistory[key] ??= []).push({
    id,
    key,
    oldValue: rate?.value,
    newValue,
    changedBy: 'op-1',
    changedByEmail: 'ops@lytro.app',
    noticeId: null,
    changedAt: NOW,
  });
  update(state.rates, key, { value: newValue, effectiveFrom: NOW }, 'key');
  return { data: { ok: true, id } };
}

function settingsAnswer(
  method: string,
  path: string,
  body: Row | null,
  state: PricingState,
): Answer | undefined {
  if (path === '/operator/settings') return { data: state.settings };
  const one = /^\/operator\/settings\/([^/]+)$/.exec(path);
  if (!one || method !== 'PATCH') return undefined;
  update(
    state.settings,
    one[1],
    { value: body?.value, updatedByEmail: 'ops@lytro.app', updatedBy: 'op-1', updatedAt: NOW },
    'key',
  );
  return OK;
}

function walletsAnswer(
  method: string,
  path: string,
  body: Row | null,
  state: PricingState,
): Answer | undefined {
  if (path === '/operator/platform-wallets') {
    if (method === 'GET') return { data: state.wallets };
    const created = { ...body, id: newId('wallet'), createdAt: NOW };
    state.wallets.push(created);
    return { data: created };
  }
  const one = /^\/operator\/platform-wallets\/([^/]+)$/.exec(path);
  if (!one) return undefined;
  if (method === 'DELETE') {
    state.wallets = state.wallets.filter((each) => each.id !== one[1]);
    return OK;
  }
  return { data: update(state.wallets, one[1], body ?? {}) };
}

function addonsAnswer(
  method: string,
  path: string,
  body: Row | null,
  state: PricingState,
): Answer | undefined {
  if (path === '/operator/addons') {
    if (method === 'GET') return { data: state.catalogueAddons };
    const created = {
      ...body,
      price: `${String(body?.price)}.00`,
      id: newId('addon'),
      retiredAt: null,
      createdAt: NOW,
      running: 0,
      boughtThisMonth: 0,
    };
    state.catalogueAddons.push(created);
    return { data: created };
  }
  const retired = /^\/operator\/addons\/([^/]+)\/retire$/.exec(path);
  if (retired) return { data: update(state.catalogueAddons, retired[1], { retiredAt: NOW }) };
  const one = /^\/operator\/addons\/([^/]+)$/.exec(path);
  if (!one) return undefined;
  const patch: Row = { ...body };
  if (body?.price !== undefined) patch.price = `${String(Number(body.price))}.00`;
  return { data: update(state.catalogueAddons, one[1], patch) };
}

function presetsAnswer(
  method: string,
  path: string,
  body: Row | null,
  state: PricingState,
): Answer | undefined {
  if (path === '/operator/presets') return { data: state.presets };
  const one = /^\/operator\/presets\/([^/]+)$/.exec(path);
  if (!one || method !== 'PATCH' || !body) return undefined;
  const preset = state.presets.find((each) => each.key === one[1]);
  if (!preset) return { refused: [404, 'not_found', 'This shop type was not found.'] };
  preset.labelEn = body.labelEn;
  preset.labelBn = body.labelBn;
  preset.defaults = {
    stockUnit: body.defaultStockUnit,
    stockTracking: body.defaultNotTracked ? 'not_tracked' : 'tracked',
    batchTracked: body.defaultBatch,
    serialTracked: body.defaultSerial,
    serialFormat: body.defaultSerialFormat,
    lowStockThreshold: `${String(body.defaultLowStock)}.000`,
    suggestedCategories: body.suggestedCategories,
    suggestedAttributeIds: body.suggestedAttributeIds,
    upFrontFields: body.upFrontFields,
  };
  return { data: preset };
}

function attributesAnswer(
  method: string,
  path: string,
  body: Row | null,
  state: PricingState,
): Answer | undefined {
  if (path === '/operator/attributes') {
    if (method === 'GET') return { data: state.attributes };
    const created = {
      unitKind: null,
      ...body,
      id: newId('attr'),
      scope: 'platform',
      retired: false,
      options: [],
    };
    state.attributes.push(created);
    return { data: created };
  }
  const option = /^\/operator\/attributes\/([^/]+)\/options(?:\/([^/]+))?$/.exec(path);
  if (option) {
    const attribute = state.attributes.find((each) => each.id === option[1]);
    const options = (attribute?.options ?? []) as Row[];
    if (option[2] === undefined) {
      const created = {
        swatchColor: null,
        ...body,
        id: newId('opt'),
        swatchImage: null,
        scope: 'platform',
        retired: false,
      };
      options.push(created);
      return { data: created };
    }
    return { data: update(options, option[2], body ?? {}) };
  }
  const one = /^\/operator\/attributes\/([^/]+)$/.exec(path);
  if (!one) return undefined;
  return { data: update(state.attributes, one[1], body ?? {}) };
}

function optionSetsAnswer(
  method: string,
  path: string,
  body: Row | null,
  state: PricingState,
): Answer | undefined {
  if (path === '/operator/option-sets') {
    if (method === 'GET') return { data: state.optionSets };
    const created = { presetKey: null, ...body, id: newId('set'), scope: 'platform' };
    state.optionSets.push(created);
    return { data: created };
  }
  const one = /^\/operator\/option-sets\/([^/]+)$/.exec(path);
  if (!one) return undefined;
  if (method === 'DELETE') {
    state.optionSets = state.optionSets.filter((each) => each.id !== one[1]);
    return OK;
  }
  return { data: update(state.optionSets, one[1], body ?? {}) };
}

/** What Pricing, Platform and the catalogue read and write. Undefined for any other route. */
export function pricingAnswer(
  method: string,
  path: string,
  body: Row | null,
  state: PricingState,
): Answer | undefined {
  for (const answer of [
    plansAnswer,
    termsAnswer,
    ratesAnswer,
    settingsAnswer,
    walletsAnswer,
    addonsAnswer,
    presetsAnswer,
    attributesAnswer,
    optionSetsAnswer,
  ]) {
    const answered = answer(method, path, body, state);
    if (answered) return answered;
  }
  return undefined;
}
