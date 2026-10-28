import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Permission } from '@lytronix/validators';
import { useAttributes, useOptionSets, useUpdateAttribute } from '@/api/attributes';
import { Icon } from '@/components/icon';
import { Banner } from '@/components/ui/banner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { RowChevron, RowLead, RowList, RowText, rowClass } from '@/components/ui/list-row';
import { Eyebrow } from '@/components/ui/page';
import { SearchField } from '@/components/ui/search-field';
import { SkeletonRows } from '@/components/ui/skeleton';
import { useErrorText } from '@/hooks/use-error-text';
import { allows } from '@/shell/hubs';
import { useShell } from '@/shell/shell-context';
import { ShellPage } from '@/shell/shell-page';
import { ATTRIBUTE_ICONS } from '../product/attribute-icons';
import { AttributeChips } from './attribute-chips';
import { AttributeSheet } from './attribute-sheet';
import { useAttributeWords } from './attribute-words';
import { NewAttributeSheet } from './new-attribute-sheet';
import { ScopeTag } from './scope-tag';

/**
 * Attributes (TENANT-DASHBOARD-DESIGN §7.6, Part 19's `attributes`; ATL-01, ATR-01, ATR-10): the library's attributes
 * and the shop's own, searched by name, each opening its sheet; New attribute as the product editor makes one; the
 * shop's own retired ones last, greyed, with Bring back.
 */
export function AttributesView(): React.JSX.Element {
  const { t } = useTranslation('shop');
  const errorText = useErrorText();
  const words = useAttributeWords();
  const { slug, viewer } = useShell();
  const mayManage = allows(viewer, [Permission.ProductsManage]);
  const attributes = useAttributes({ includeRetired: true });
  const sets = useOptionSets();
  const bringBack = useUpdateAttribute();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const [making, setMaking] = useState(false);

  const all = attributes.data ?? [];
  const search = query.trim().toLowerCase();
  const found = all.filter((each) => each.name.toLowerCase().includes(search));
  const live = found.filter((each) => !each.retired);
  // The library's retired attributes are the operator's; only the shop's own come back from here.
  const retired = found.filter((each) => each.retired && each.scope === 'shop');

  return (
    <ShellPage
      actions={
        mayManage ? (
          <Button
            size="sm"
            onClick={() => {
              setMaking(true);
            }}
          >
            <Icon name="plus" />
            {t('newAttr')}
          </Button>
        ) : null
      }
    >
      <AttributeChips
        slug={slug}
        current="attributes"
        attributes={attributes.data ? all.filter((each) => !each.retired).length : undefined}
        sets={sets.data?.length}
      />
      {attributes.isError ? <Banner tone="bad">{errorText(attributes.error)}</Banner> : null}
      {bringBack.isError ? <Banner tone="bad">{errorText(bringBack.error)}</Banner> : null}
      <SearchField
        label={t('searchAttributes')}
        placeholder={t('searchAttributes')}
        value={query}
        onChange={setQuery}
      />
      {attributes.isPending ? (
        <Card flush>
          <SkeletonRows count={4} />
        </Card>
      ) : live.length === 0 && retired.length === 0 ? (
        <p className="text-[14px] text-fg-muted">{t('noAttributes')}</p>
      ) : (
        <>
          {live.length > 0 ? (
            <Card flush>
              <RowList>
                {live.map((attribute) => (
                  <button
                    key={attribute.id}
                    type="button"
                    className={rowClass}
                    onClick={() => {
                      setOpen(attribute.id);
                    }}
                  >
                    <RowLead>
                      <Icon name={ATTRIBUTE_ICONS[attribute.dataType]} />
                    </RowLead>
                    <RowText
                      title={
                        <>
                          {attribute.name} <ScopeTag scope={attribute.scope} />
                        </>
                      }
                      sub={words.kind(attribute)}
                    />
                    <RowChevron />
                  </button>
                ))}
              </RowList>
            </Card>
          ) : null}
          {retired.length > 0 ? (
            <>
              <div className="mt-1">
                <Eyebrow>{t('retired')}</Eyebrow>
              </div>
              <Card flush>
                <RowList>
                  {retired.map((attribute) => (
                    <div key={attribute.id} className={rowClass}>
                      {/* Greyed as drawn, by colour rather than opacity, so its words keep AA contrast. */}
                      <span className="opacity-60">
                        <RowLead>
                          <Icon name={ATTRIBUTE_ICONS[attribute.dataType]} />
                        </RowLead>
                      </span>
                      <RowText
                        title={
                          <>
                            <span className="text-fg-muted">{attribute.name}</span>{' '}
                            <ScopeTag scope={attribute.scope} />
                          </>
                        }
                        sub={words.kind(attribute)}
                      />
                      {mayManage ? (
                        <Button
                          tone="outline"
                          size="xs"
                          aria-label={t('bringBackNamed', { name: attribute.name })}
                          busy={bringBack.isPending && bringBack.variables.id === attribute.id}
                          onClick={() => {
                            bringBack.mutate({ id: attribute.id, body: { retired: false } });
                          }}
                        >
                          {t('bringBack')}
                        </Button>
                      ) : null}
                    </div>
                  ))}
                </RowList>
              </Card>
            </>
          ) : null}
        </>
      )}
      <p className="text-[14px] text-fg-muted">{t('retiredHint')}</p>
      <AttributeSheet
        attribute={all.find((each) => each.id === open) ?? null}
        readOnly={!mayManage}
        onClose={() => {
          setOpen(null);
        }}
      />
      <NewAttributeSheet
        open={making}
        onClose={() => {
          setMaking(false);
        }}
      />
    </ShellPage>
  );
}
