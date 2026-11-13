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

/** One line on a plan card: what the plan gives, ticked, or what it doesn't, crossed out. */
export interface PlanLine {
  text: string;
  on: boolean;
}

export interface PricingPlanView {
  id: string;
  name: string;
  description: string | null;
  /** PLN-21: the plan the operator marked as suggested, drawn as the highlighted card with the badge. */
  hot: boolean;
  lines: PlanLine[];
  /** What else it gives, for the card's quieter list (storage, bandwidth, API, phones, brand identity). */
  more: PlanLine[];
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
  name: string;
  description: string;
  price: string;
  /** PLN-21: pay-as-you-go can be the suggested plan too. */
  hot: boolean;
  lines: PlanLine[];
  /** Its own limits, for the card's quieter list; empty when they couldn't be read. */
  more: PlanLine[];
  cta: string;
  signInUrl: string;
}

/** One list of a card's lines: a tick for what the plan gives, a cross and a strike for what it doesn't (site.css
    `.plan li.no`), which a screen reader hears as "not included". */
function LineList({
  lines,
  size,
  className,
  language,
}: {
  lines: PlanLine[];
  size: number;
  className?: string;
  language: Language;
}) {
  return (
    <ul className={className}>
      {lines.map((line) => (
        <li key={line.text} className={line.on ? undefined : 'no'}>
          <Icon name={line.on ? 'check' : 'x'} size={size} strokeWidth={line.on ? 2.4 : 2.2} />
          <span>
            {line.on ? null : <span className="sr-only">{text.notIncluded[language]}</span>}
            {line.text}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** A card's lines, then what else it gives in a quieter list below a dashed line (site.css `.plan ul.more`). */
function PlanLines({
  lines,
  more,
  language,
}: {
  lines: PlanLine[];
  more: PlanLine[];
  language: Language;
}) {
  return (
    <>
      <LineList lines={lines} size={18} language={language} />
      {more.length > 0 ? (
        <LineList lines={more} size={16} className="more" language={language} />
      ) : null}
    </>
  );
}

const text = {
  notIncluded: { bn: 'নেই: ', en: 'Not included: ' },
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
    when tapped; a two-column grid from 640 px and four across from 1100 px. The plan the operator marked as
    suggested is the highlighted card (site.css `.plan.hot`, with its `.badge` and the accent button); the others
    are white with an outline button. */
export function PricingCards({
  language,
  head,
  badge,
  payg,
  view,
}: {
  language: Language;
  /** The section's eyebrow, headline and lead, rendered on the server. */
  head: ReactNode;
  /** The highlighted card's badge. */
  badge: string;
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
        {/* How many cards the plans make: a row with fewer than four sizes to them and sits centred (site.css). */}
        <div className="pgrid" data-plans={Math.min(names.length, 4)}>
          <article className={payg.hot ? 'plan card hot' : 'plan card'}>
            {payg.hot ? <span className="badge">{badge}</span> : null}
            <h3 className="bn-name">{payg.name}</h3>
            <p className="who">{payg.description}</p>
            <p className="price">
              <b>{payg.price}</b>
              <span>{text.perMonth[language]}</span>
            </p>
            <PlanLines lines={payg.lines} more={payg.more} language={language} />
            <a href={payg.signInUrl} className={payg.hot ? 'btn btn-accent' : 'btn btn-outline'}>
              {payg.cta}
            </a>
          </article>

          {view?.plans.map((plan) => {
            const price = plan.prices[termId];
            const href = plan.signInUrls[termId] ?? plan.signInUrls[view.defaultTermId] ?? '#';
            return (
              <article key={plan.id} className={plan.hot ? 'plan card hot' : 'plan card'}>
                {plan.hot ? <span className="badge">{badge}</span> : null}
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
                <PlanLines lines={plan.lines} more={plan.more} language={language} />
                <a href={href} className={plan.hot ? 'btn btn-accent' : 'btn btn-outline'}>
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
