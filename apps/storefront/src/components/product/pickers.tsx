'use client';

import { CAPTURED_VALUE_MAX_LENGTH } from '@lytronix/validators/common';
import { useMemo, useState } from 'react';
import type { ModifierGroup, PublicProduct } from '@/lib/api/storefront-api';
import type { CartLine } from '@/lib/cart/cart-store';
import { money, type Words } from '@/lib/i18n/words';
import {
  addOnsPrice,
  addOnsShort,
  type Answers,
  answerFits,
  answersOf,
  asksNumber,
  comboCanBeMade,
  comboChoicesOf,
  comboPartsText,
  modifierChoicesOf,
  openingAddOns,
  openingComboPicks,
  pickComboUnit,
  pickedAddOns,
  toggleAddOn,
} from '@/lib/product/picks';

// MNU-01, CMB-09, ATR-08 (Slice 4.8e, the prototype's `e48-addons`, `combo`, `e48-asked`): what a shopper picks besides
// the variant, on the product page and the landing page alike.

/** What the shopper has picked, and what a cart line keeps of it. `ready` says whether it can be added, and shows why
    not from then on. */
export function usePicks(product: PublicProduct) {
  const groups = product.modifierGroups;
  const [addOns, setAddOns] = useState(() => openingAddOns(groups));
  const [combo, setCombo] = useState(() => openingComboPicks(product.combo));
  const [answers, setAnswers] = useState<Answers>({});
  const [tried, setTried] = useState(false);
  const short = useMemo(() => addOnsShort(groups, addOns), [groups, addOns]);
  const fits = product.asked.every((each) => answerFits(each, answers));

  const lineFields: Pick<
    CartLine,
    'modifiers' | 'addOns' | 'comboPicks' | 'partsText' | 'answers'
  > = {
    ...(groups.length > 0
      ? {
          modifiers: modifierChoicesOf(groups, addOns),
          addOns: pickedAddOns(groups, addOns),
        }
      : {}),
    ...(product.combo
      ? {
          comboPicks: comboChoicesOf(combo),
          partsText: comboPartsText(product.combo, combo),
        }
      : {}),
    ...(product.asked.length > 0 ? { answers: answersOf(product.asked, answers) } : {}),
  };

  return {
    addOns,
    setAddOns,
    combo,
    setCombo,
    answers,
    setAnswers,
    /** Groups named as short only once the shopper has tried to go on. */
    shortShown: tried ? short : [],
    lineFields,
    addOnsPrice: addOnsPrice(groups, addOns),
    canBeMade: comboCanBeMade(product.combo),
    ready: (): boolean => {
      setTried(true);
      return short.length === 0 && fits;
    },
  };
}

export type Picks = ReturnType<typeof usePicks>;

/** The rule a group is held to, as its label says it. */
function ruleText(group: ModifierGroup, words: Words): string {
  if (group.minSelect === 0) return words.t('rule_optional', { n: group.maxSelect });
  if (group.minSelect === group.maxSelect) return words.t('rule_pick', { n: group.minSelect });
  return words.t('rule_range', { a: group.minSelect, b: group.maxSelect });
}

function priceChangeText(priceChange: string): string {
  const amount = Number(priceChange);
  if (amount === 0) return '';
  return amount > 0 ? `+${money(amount)}` : `−${money(-amount)}`;
}

/** MNU-01: each group with its rule and its options with their price; the total in the bar follows. */
export function AddOnGroups({
  product,
  picks,
  words,
}: {
  product: PublicProduct;
  picks: Picks;
  words: Words;
}) {
  return (
    <>
      {product.modifierGroups.map((group) => {
        const held = picks.addOns[group.id] ?? [];
        const one = group.maxSelect === 1;
        return (
          <div className="opt" key={group.id}>
            <div className="lb">
              <span>
                {words.t('e48Addons')} · {group.name}
              </span>
              <span className="sub" style={{ fontSize: 12 }}>
                {ruleText(group, words)}
              </span>
            </div>
            <div className="addons" role={one ? 'radiogroup' : 'group'} aria-label={group.name}>
              {group.options.map((option) => {
                const on = held.includes(option.id);
                return (
                  <button
                    key={option.id}
                    type="button"
                    className={on ? 'radio on' : 'radio'}
                    role={one ? 'radio' : 'checkbox'}
                    aria-checked={on}
                    style={{
                      padding: '10px 12px',
                      border: '1px solid var(--line)',
                      borderRadius: 10,
                    }}
                    onClick={() => {
                      picks.setAddOns(toggleAddOn(picks.addOns, group, option.id));
                    }}
                  >
                    <span className="dot" />
                    <span className="b">
                      <span className="l1">{option.name}</span>
                    </span>
                    <span className="price" style={{ fontSize: 14 }}>
                      {priceChangeText(option.priceChange)}
                    </span>
                  </button>
                );
              })}
            </div>
            {picks.shortShown.includes(group.id) ? (
              <div className="field">
                <div className="err" role="alert">
                  {words.t(one ? 'e48PickErr' : 'rule_pick', { n: group.minSelect })}
                </div>
              </div>
            ) : null}
          </div>
        );
      })}
    </>
  );
}

/** ATR-08: what the seller marked asked when ordering; each answer optional, a number held to being one. */
export function AskedFields({
  product,
  picks,
  words,
}: {
  product: PublicProduct;
  picks: Picks;
  words: Words;
}) {
  return (
    <>
      {product.asked.map((each) => {
        const id = `asked-${each.attributeId}`;
        const fits = answerFits(each, picks.answers);
        return (
          <div className="opt" key={each.attributeId}>
            <div className="field">
              <label htmlFor={id}>{words.t('e48AskedOpt', { name: each.name })}</label>
              <input
                id={id}
                className={fits ? 'input' : 'input bad'}
                inputMode={asksNumber(each) ? 'decimal' : undefined}
                maxLength={CAPTURED_VALUE_MAX_LENGTH}
                value={picks.answers[each.attributeId] ?? ''}
                onChange={(event) => {
                  picks.setAnswers({ ...picks.answers, [each.attributeId]: event.target.value });
                }}
              />
              {fits ? null : <div className="err">{words.t('e48AskedNumber')}</div>}
            </div>
          </div>
        );
      })}
    </>
  );
}

/** CMB-09: What's inside: a choice part a pick for each of its units, a sold-out one struck through; a fixed part what
    comes with it. */
export function ComboInside({
  product,
  picks,
  words,
}: {
  product: PublicProduct;
  picks: Picks;
  words: Words;
}) {
  if (!product.combo) return null;
  return (
    <div className="opt">
      <div className="lb">
        <span>{words.t('inside')}</span>
      </div>
      <div className="combo">
        {product.combo.parts.map((part) => {
          const units = picks.combo[part.position] ?? [];
          const fixed = part.choice ? null : part.variants[0];
          const named = fixed ? `${part.productName} ${fixed.label}`.trim() : part.productName;
          return (
            <div className="part" key={part.position}>
              <span className="th">
                {part.image ? <img src={part.image.urls.thumbnail} alt="" /> : null}
              </span>
              <div className="b">
                {named} × {Number(part.quantity)}
                <div className="l2">{words.t(part.choice ? 'combo_pick' : 'e48Comes')}</div>
                {units.map((picked, unit) => (
                  <div
                    className="vals"
                    role="group"
                    aria-label={part.productName}
                    style={{ marginTop: 6 }}
                    key={unit}
                  >
                    {part.variants.map((variant) => {
                      const on = variant.variantId === picked;
                      const mixed = variant.productName !== part.productName;
                      const text = mixed
                        ? `${variant.productName} ${variant.label}`.trim()
                        : variant.label || variant.productName;
                      return (
                        <button
                          key={variant.variantId}
                          type="button"
                          className={`vb${on ? ' on' : ''}${variant.available ? '' : ' gone'}${variant.image ? ' pic' : ''}`}
                          aria-pressed={on}
                          disabled={!variant.available}
                          onClick={() => {
                            picks.setCombo(
                              pickComboUnit(picks.combo, part.position, unit, variant.variantId),
                            );
                          }}
                        >
                          {/* ATR-20 (PD-4): a design is offered by its photo, its label never naming it. */}
                          {variant.image ? <img src={variant.image.urls.thumbnail} alt="" /> : null}
                          {text}
                        </button>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
