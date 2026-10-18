'use client';

import { useRef, useState } from 'react';
import { CheckList } from '@/components/ui/check-list';
import { buttonClass } from '@/components/ui/button';
import type { Language } from '@/lib/i18n/language';

// What the server hands the client: every figure already computed, every label already in both languages.
export interface PricingTermView {
  id: string;
  label: string;
  months: number;
  /** The biggest saving any plan makes on this term, for the toggle badge; 0 on the base term. */
  savingPercent: number;
}

export interface PricingPlanView {
  id: string;
  name: string;
  description: string | null;
  lines: string[];
  /** Per term id: the full price and its monthly equivalent, both already formatted. */
  prices: Record<string, { total: string; monthly: string } | undefined>;
  signInUrls: Record<string, string | undefined>;
}

export interface PricingView {
  terms: PricingTermView[];
  defaultTermId: string;
  plans: PricingPlanView[];
}

export interface PaygView {
  badge: string;
  name: string;
  description: string;
  price: string;
  lines: string[];
  cta: string;
  signInUrl: string;
}

const text = {
  perMonth: { bn: '/ মাস', en: 'per month' },
  perTerm: { bn: 'মোট', en: 'total' },
  choose: { bn: 'নিন', en: 'Choose' },
  off: { bn: 'কম', en: 'off' },
  slide: { bn: 'প্ল্যান', en: 'Plan' },
} as const;

/** The pricing cards with the billing-term toggle. On a phone the cards are a snap-scrolling row with
    position dots; from 640 px they become a grid (LANDING-PAGE-DESIGN.md §4). */
export function PricingCards({
  language,
  payg,
  view,
}: {
  language: Language;
  payg: PaygView;
  view: PricingView | null;
}) {
  const [termId, setTermId] = useState(view?.defaultTermId ?? '');
  const [active, setActive] = useState(0);
  const row = useRef<HTMLDivElement>(null);

  const cardCount = 1 + (view?.plans.length ?? 0);
  const baseTerm = view?.terms.find((term) => term.id === termId);
  const monthlyTerm = baseTerm?.months === 1;

  const onScroll = () => {
    const element = row.current;
    if (!element || element.children.length === 0) return;
    const first = element.children[0];
    if (!(first instanceof HTMLElement)) return;
    const step = first.offsetWidth + 16;
    setActive(Math.min(cardCount - 1, Math.round(element.scrollLeft / step)));
  };

  return (
    <div>
      {view && view.terms.length > 1 ? (
        <div className="mt-8 flex justify-center">
          <div
            role="group"
            className="inline-flex rounded-full border border-neutral-200 bg-white p-1"
          >
            {view.terms.map((term) => (
              <button
                key={term.id}
                type="button"
                aria-pressed={term.id === termId}
                onClick={() => {
                  setTermId(term.id);
                }}
                className={`inline-flex min-h-10 items-center gap-2 rounded-full px-4 text-[14px] font-bold transition-colors ${
                  term.id === termId ? 'bg-brand-700 text-white' : 'text-neutral-700 hover:text-ink'
                }`}
              >
                {term.label}
                {term.savingPercent > 0 ? (
                  <span
                    className={`num rounded-full px-2 py-0.5 text-[11px] ${
                      term.id === termId
                        ? 'bg-white/20 text-white'
                        : 'bg-accent-100 text-accent-700'
                    }`}
                  >
                    {String(term.savingPercent)}% {text.off[language]}
                  </span>
                ) : null}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <div
        ref={row}
        onScroll={onScroll}
        className="scroll-row mt-8 -mx-4 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-2 sm:mx-0 sm:grid sm:grid-cols-2 sm:overflow-visible sm:px-0 lg:grid-cols-4"
      >
        <article className="relative flex w-[82vw] max-w-[340px] shrink-0 snap-center flex-col rounded-card border-2 border-accent-500 bg-white p-5 shadow-lift sm:w-auto sm:max-w-none">
          <span className="absolute -top-3.5 left-5 rounded-full bg-accent-500 px-3 py-1 text-[12px] font-bold text-ink">
            {payg.badge}
          </span>
          <h3 className="heading mt-2 text-[20px] text-ink">{payg.name}</h3>
          <p className="mt-1 min-h-[42px] text-[14px] text-neutral-700">{payg.description}</p>
          <p className="mt-4 flex items-baseline gap-1.5">
            <span className="num text-[36px] font-extrabold leading-none text-ink">
              {payg.price}
            </span>
            <span className="text-[14px] text-neutral-700">{text.perMonth[language]}</span>
          </p>
          <CheckList className="mt-5 flex-1" items={payg.lines} />
          <a href={payg.signInUrl} className={`mt-6 ${buttonClass('accent', 'lg')}`}>
            {payg.cta}
          </a>
        </article>

        {view?.plans.map((plan) => {
          const price = plan.prices[termId];
          const href = plan.signInUrls[termId] ?? plan.signInUrls[view.defaultTermId] ?? '#';
          return (
            <article
              key={plan.id}
              className="flex w-[82vw] max-w-[340px] shrink-0 snap-center flex-col rounded-card border border-line bg-white p-5 shadow-card sm:w-auto sm:max-w-none"
            >
              <h3 className="heading mt-2 text-[20px] text-ink">{plan.name}</h3>
              <p className="mt-1 min-h-[42px] text-[14px] text-neutral-700">
                {plan.description ?? ''}
              </p>
              {price ? (
                <p className="mt-4 flex flex-wrap items-baseline gap-x-1.5">
                  <span className="num text-[36px] font-extrabold leading-none text-ink">
                    {price.monthly}
                  </span>
                  <span className="text-[14px] text-neutral-700">{text.perMonth[language]}</span>
                  {!monthlyTerm ? (
                    <span className="num mt-1 w-full text-[13px] text-neutral-700">
                      {price.total} {text.perTerm[language]}
                    </span>
                  ) : null}
                </p>
              ) : (
                <p className="mt-4 text-[14px] text-neutral-700">—</p>
              )}
              <CheckList className="mt-5 flex-1" items={plan.lines} />
              <a href={href} className={`mt-6 ${buttonClass('primary', 'lg')}`}>
                {language === 'bn'
                  ? `${plan.name} ${text.choose.bn}`
                  : `${text.choose.en} ${plan.name}`}
              </a>
            </article>
          );
        })}
      </div>

      {cardCount > 1 ? (
        <div className="mt-3 flex justify-center gap-1.5 sm:hidden" aria-hidden="true">
          {Array.from({ length: cardCount }, (_, index) => (
            <span
              key={index}
              className={`h-1.5 rounded-full transition-all ${index === active ? 'w-5 bg-brand-700' : 'w-1.5 bg-neutral-200'}`}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
