'use client';

import { type ReactNode, useEffect, useRef, useState } from 'react';
import { Icon } from '@/components/ui/icon';
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
  /** What else it gives, for the card's quieter list (storage, bandwidth, API, phones, brand identity). */
  more: string[];
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
  /** Its own limits, for the card's quieter list; empty when they couldn't be read. */
  more: string[];
  cta: string;
  signInUrl: string;
}

/** A card's lines, then what else it gives in a quieter list below a dashed line (site.css `.plan ul.more`). */
function PlanLines({ lines, more }: { lines: string[]; more: string[] }) {
  return (
    <>
      <ul>
        {lines.map((line) => (
          <li key={line}>
            <Icon name="check" size={18} strokeWidth={2.4} />
            <span>{line}</span>
          </li>
        ))}
      </ul>
      {more.length > 0 ? (
        <ul className="more">
          {more.map((line) => (
            <li key={line}>
              <Icon name="check" size={16} strokeWidth={2.4} />
              <span>{line}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </>
  );
}

const text = {
  perMonth: { bn: '/ মাস', en: 'per month' },
  perTerm: { bn: 'মোট', en: 'total' },
  choose: { bn: 'নিন', en: 'Choose' },
  off: { bn: 'কম', en: 'off' },
  terms: { bn: 'বিলিং মেয়াদ', en: 'Billing term' },
  plans: { bn: 'প্ল্যান', en: 'Plans' },
} as const;

/** The card row on a phone (site.css `.pscroll`): each card's left edge, and which card sits at the row's start. */
class CardRow {
  constructor(private readonly element: HTMLElement) {}

  private cards(): HTMLElement[] {
    return Array.from(this.element.querySelectorAll<HTMLElement>('.plan'));
  }

  private start(): number {
    const padding = Number.parseFloat(getComputedStyle(this.element).paddingLeft) || 0;
    return this.element.getBoundingClientRect().left + padding;
  }

  /** The card nearest the row's start; the last one once the row is scrolled to its end. */
  current(): number {
    const cards = this.cards();
    const atEnd =
      this.element.scrollLeft + this.element.clientWidth >= this.element.scrollWidth - 4;
    if (atEnd && this.element.scrollLeft > 0) return cards.length - 1;
    const start = this.start();
    let best = 0;
    cards.forEach((card, index) => {
      const distance = Math.abs(card.getBoundingClientRect().left - start);
      const bestDistance = Math.abs((cards[best]?.getBoundingClientRect().left ?? 0) - start);
      if (distance < bestDistance) best = index;
    });
    return best;
  }

  /** Brings a card to the row's start. */
  goTo(index: number): void {
    const card = this.cards()[index];
    if (!card) return;
    this.element.scrollBy({
      left: card.getBoundingClientRect().left - this.start(),
      behavior: 'smooth',
    });
  }
}

/** The sketch's pricing (LANDING-PAGE-DESIGN.md §3 row 8): the heading with the term toggle under it, then the cards
    as a swipe row on a phone, the next card peeking in and dots under it that follow the swipe and bring a card in
    when tapped; a two-column grid from 640 px and four across from 1100 px. The highlighted card is the one with
    `hot` (site.css `.plan.hot`, with its `.badge`). */
export function PricingCards({
  language,
  head,
  payg,
  view,
}: {
  language: Language;
  /** The section's eyebrow, headline and lead, rendered on the server. */
  head: ReactNode;
  payg: PaygView;
  view: PricingView | null;
}) {
  const [termId, setTermId] = useState(view?.defaultTermId ?? '');
  const [active, setActive] = useState(0);
  const rowRef = useRef<HTMLDivElement>(null);

  const names = [payg.name, ...(view?.plans.map((plan) => plan.name) ?? [])];
  const baseTerm = view?.terms.find((term) => term.id === termId);
  const monthlyTerm = baseTerm?.months === 1;

  useEffect(() => {
    const element = rowRef.current;
    if (!element || names.length < 2) return;
    const row = new CardRow(element);
    const onScroll = () => {
      setActive(row.current());
    };
    element.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      element.removeEventListener('scroll', onScroll);
    };
  }, [names.length]);

  const goTo = (index: number) => {
    if (rowRef.current) new CardRow(rowRef.current).goTo(index);
  };

  return (
    <>
      <div className="sec-head center">
        {head}
        {view && view.terms.length > 1 ? (
          <div className="term" role="group" aria-label={text.terms[language]}>
            {view.terms.map((term) => (
              <button
                key={term.id}
                type="button"
                aria-pressed={term.id === termId}
                onClick={() => {
                  setTermId(term.id);
                }}
              >
                <span>{term.label}</span>
                {term.savingPercent > 0 ? (
                  <span className="save">
                    {String(term.savingPercent)}% {text.off[language]}
                  </span>
                ) : null}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <div className="pscroll" ref={rowRef}>
        <div className="pgrid">
          <article className="plan card hot">
            <span className="badge">{payg.badge}</span>
            <h3 className="bn-name">{payg.name}</h3>
            <p className="who">{payg.description}</p>
            <p className="price">
              <b>{payg.price}</b>
              <span>{text.perMonth[language]}</span>
            </p>
            <PlanLines lines={payg.lines} more={payg.more} />
            <a href={payg.signInUrl} className="btn btn-accent">
              {payg.cta}
            </a>
          </article>

          {view?.plans.map((plan) => {
            const price = plan.prices[termId];
            const href = plan.signInUrls[termId] ?? plan.signInUrls[view.defaultTermId] ?? '#';
            return (
              <article key={plan.id} className="plan card">
                <h3>{plan.name}</h3>
                {plan.description ? <p className="who">{plan.description}</p> : null}
                {price ? (
                  <p className="price">
                    <b>{price.monthly}</b>
                    <span>{text.perMonth[language]}</span>
                    {!monthlyTerm ? (
                      <small>
                        {price.total} {text.perTerm[language]}
                      </small>
                    ) : null}
                  </p>
                ) : (
                  <p className="price">
                    <span>—</span>
                  </p>
                )}
                <PlanLines lines={plan.lines} more={plan.more} />
                <a href={href} className="btn btn-primary">
                  {language === 'bn'
                    ? `${plan.name} ${text.choose.bn}`
                    : `${text.choose.en} ${plan.name}`}
                </a>
              </article>
            );
          })}
        </div>
      </div>

      {names.length > 1 ? (
        <div className="pdots" role="group" aria-label={text.plans[language]}>
          {names.map((name, index) => (
            <button
              key={name}
              type="button"
              aria-label={name}
              aria-current={index === active ? 'true' : 'false'}
              onClick={() => {
                goTo(index);
              }}
            />
          ))}
        </div>
      ) : null}
    </>
  );
}
