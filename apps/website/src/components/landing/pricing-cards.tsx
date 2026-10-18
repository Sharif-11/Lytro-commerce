'use client';

import { useEffect, useRef, useState } from 'react';
import { buttonClass } from '@/components/ui/button';
import { CheckList } from '@/components/ui/check-list';
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
  goTo: { bn: 'প্ল্যান', en: 'Plan' },
} as const;

/** Phones only: the card row is a snap carousel that advances on its own every few seconds, stops while the
    visitor touches or scrolls it, and resumes a while after they let go. Off from 640 px, where the cards
    are a grid, and for visitors who prefer reduced motion. */
const PHONE_QUERY = '(max-width: 639px) and (prefers-reduced-motion: no-preference)';
const ROTATE_EVERY_MS = 4500;
const RESUME_AFTER_MS = 9000;

class CardRow {
  constructor(private readonly element: HTMLElement) {}

  /** Each card's left edge, in scroll coordinates. */
  stops(): number[] {
    return Array.from(this.element.children)
      .filter((child): child is HTMLElement => child instanceof HTMLElement)
      .map((child) => child.offsetLeft - this.element.offsetLeft);
  }

  /** The index of the card nearest the current scroll position. */
  current(): number {
    const stops = this.stops();
    let best = 0;
    for (let index = 0; index < stops.length; index += 1) {
      const stop = stops[index] ?? 0;
      const bestStop = stops[best] ?? 0;
      if (Math.abs(stop - this.element.scrollLeft) < Math.abs(bestStop - this.element.scrollLeft)) {
        best = index;
      }
    }
    return best;
  }

  goTo(index: number, smooth: boolean): void {
    const left = this.stops()[index] ?? 0;
    this.element.scrollTo({ left, behavior: smooth ? 'smooth' : 'auto' });
  }
}

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
  const rowRef = useRef<HTMLDivElement>(null);
  const pausedUntil = useRef(0);

  const cardCount = 1 + (view?.plans.length ?? 0);
  const baseTerm = view?.terms.find((term) => term.id === termId);
  const monthlyTerm = baseTerm?.months === 1;

  useEffect(() => {
    const element = rowRef.current;
    if (!element || cardCount < 2) return;
    const row = new CardRow(element);
    const media = window.matchMedia(PHONE_QUERY);
    let visible = false;

    const onScroll = () => {
      setActive(row.current());
    };
    const pause = () => {
      pausedUntil.current = Date.now() + RESUME_AFTER_MS;
    };
    const tick = () => {
      if (!media.matches || !visible || Date.now() < pausedUntil.current) return;
      row.goTo((row.current() + 1) % cardCount, true);
    };

    const observer = new IntersectionObserver(
      (entries) => {
        visible = entries.some((entry) => entry.isIntersecting);
      },
      { threshold: 0.4 },
    );
    observer.observe(element);
    element.addEventListener('scroll', onScroll, { passive: true });
    for (const name of ['pointerdown', 'touchstart', 'wheel', 'keydown'] as const) {
      element.addEventListener(name, pause, { passive: true });
    }
    const timer = window.setInterval(tick, ROTATE_EVERY_MS);

    return () => {
      window.clearInterval(timer);
      observer.disconnect();
      element.removeEventListener('scroll', onScroll);
      for (const name of ['pointerdown', 'touchstart', 'wheel', 'keydown'] as const) {
        element.removeEventListener(name, pause);
      }
    };
  }, [cardCount]);

  const jumpTo = (index: number) => {
    const element = rowRef.current;
    if (!element) return;
    pausedUntil.current = Date.now() + RESUME_AFTER_MS;
    new CardRow(element).goTo(index, true);
  };

  return (
    <div>
      {view && view.terms.length > 1 ? (
        <div className="mt-8 flex justify-center">
          <div
            role="group"
            className="inline-flex max-w-full flex-wrap justify-center gap-1 rounded-full border border-neutral-200 bg-white p-1"
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
        ref={rowRef}
        className="scroll-row mt-8 -mx-4 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pt-4 pb-2 sm:mx-0 sm:grid sm:grid-cols-2 sm:overflow-visible sm:px-0 lg:grid-cols-4"
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
        <div className="mt-3 flex justify-center gap-2 sm:hidden">
          {Array.from({ length: cardCount }, (_, index) => (
            <button
              key={index}
              type="button"
              aria-label={`${text.goTo[language]} ${String(index + 1)}`}
              aria-current={index === active ? 'true' : undefined}
              onClick={() => {
                jumpTo(index);
              }}
              className="flex h-8 w-8 items-center justify-center"
            >
              <span
                className={`block h-2 rounded-full transition-all ${
                  index === active ? 'w-6 bg-brand-700' : 'w-2 bg-neutral-200'
                }`}
              />
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
