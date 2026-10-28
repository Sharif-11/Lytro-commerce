import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ApiClientError } from '@lytronix/api-client';
import { useAttributes } from '@/api/attributes';
import {
  NO_CATEGORY,
  useCreateCategory,
  useSetCategoryChart,
  useSetCategorySuggestions,
  useUpdateCategory,
  type CategoryFields,
} from '@/api/categories';
import { Icon } from '@/components/icon';
import { Button } from '@/components/ui/button';
import { CheckRow } from '@/components/ui/check-row';
import { Chip } from '@/components/ui/chips';
import { SearchField } from '@/components/ui/search-field';
import { Sheet } from '@/components/ui/sheet';
import { useErrorText } from '@/hooks/use-error-text';
import { BLANK_CHART, chartBody, type ChartForm } from '@/lib/product-settings';
import type { CategorySummary } from '@/types/catalogue';
import { ScopeTag } from '../attributes/scope-tag';
import { SizeChartSheet } from '../product/size-chart-sheet';
import { ChartField } from '../product/type-cards';
import { CategoryForm, ParentChoice } from './category-form';

/** What the sheet is open on: a new category (at the top, or under one), or one to edit. */
export type CategorySheetFor =
  { kind: 'new'; parentId: string | null } | { kind: 'edit'; category: CategorySummary };

/** The sheet's steps: the fields, where it sits, and the attributes it suggests. */
type Step = 'form' | 'parent' | 'attrs';

/** A category's own chart as the chart sheet edits it: a table, or a picture of the shop's. */
function chartOfCategory(category: CategorySummary | null): ChartForm {
  if (category?.sizeChartImage) {
    return { own: true, mode: 'picture', rows: BLANK_CHART, image: category.sizeChartImage };
  }
  return { own: true, mode: 'table', rows: category?.sizeChart ?? BLANK_CHART, image: null };
}

/** A chart worth keeping: a picture chosen, or a table with something typed in it. */
const hasContent = (chart: ChartForm): boolean =>
  chart.mode === 'picture'
    ? chart.image !== null
    : chart.rows.some((row) => row.some((cell) => cell.trim() !== ''));

const fieldsOf = (category: CategorySummary): CategoryFields => ({
  name: category.name,
  parentId: category.parentId,
  visible: category.visible,
  behavesLike: category.behavesLike,
});

/**
 * New category, Add a sub-category and a category's own sheet (§7.5, the prototype's `sh-category-new`,
 * `sh-category-sub` and `sh-category-edit`; PRD-03, ATR-02, PST-06, PRD-17): its fields, with where it sits as a step;
 * an existing one also suggests attributes for its new products (`sh-category-attrs`), has its own size chart (Part 19's
 * `sh-category-chart-19`, the chart sheet over the page in its place) and Delete category. Save sends what changed.
 */
export function CategorySheet({
  open,
  of,
  categories,
  onSaved,
  onDelete,
  onClose,
}: {
  open: boolean;
  of: CategorySheetFor;
  categories: readonly CategorySummary[];
  /** After a save; a new category comes back as made. */
  onSaved: (made: CategorySummary | null) => void;
  onDelete: (category: CategorySummary) => void;
  onClose: () => void;
}): React.JSX.Element {
  const { t } = useTranslation('shop');
  const errorText = useErrorText();
  const attributes = useAttributes({ enabled: open, includeRetired: true });
  const create = useCreateCategory();
  const update = useUpdateCategory();
  const suggest = useSetCategorySuggestions();
  const setChart = useSetCategoryChart();
  const editing = of.kind === 'edit' ? of.category : null;
  const [step, setStep] = useState<Step>('form');
  const [draft, setDraft] = useState<CategoryFields>(NO_CATEGORY);
  const [suggested, setSuggested] = useState<string[]>([]);
  const [chart, setChartDraft] = useState<ChartForm>(chartOfCategory(null));
  /** Whether it keeps a chart once saved. */
  const [charted, setCharted] = useState(false);
  const [charting, setCharting] = useState(false);
  const [search, setSearch] = useState('');
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<unknown>(null);

  useEffect(() => {
    if (!open) return;
    setStep('form');
    setDraft(
      editing
        ? fieldsOf(editing)
        : { ...NO_CATEGORY, parentId: of.kind === 'new' ? of.parentId : null },
    );
    setSuggested(editing?.suggestedAttributeIds ?? []);
    setChartDraft(chartOfCategory(editing));
    setCharted(hasContent(chartOfCategory(editing)));
    setCharting(false);
    setTried(false);
    setProblem(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const all = attributes.data ?? [];
  const nameOf = (id: string) => all.find((each) => each.id === id)?.name ?? '';
  const width = chart.rows[0]?.length ?? 1;
  const chartText = !charted
    ? t('chartNone')
    : chart.mode === 'picture'
      ? t('chartPicture')
      : `${t('chartRows', { count: chart.rows.length - 1 })} × ${t('chartCols', { count: width - 1 })}`;
  const problems = problem instanceof ApiClientError ? problem.fieldProblems() : {};

  async function save(): Promise<void> {
    setTried(true);
    const name = draft.name.trim();
    if (name === '') return;
    setBusy(true);
    setProblem(null);
    try {
      if (!editing) {
        onSaved(await create.mutateAsync({ ...draft, name }));
        return;
      }
      const before = fieldsOf(editing);
      const changed = Object.fromEntries(
        Object.entries({ ...draft, name }).filter(
          ([key, value]) => before[key as keyof CategoryFields] !== value,
        ),
      );
      if (Object.keys(changed).length > 0)
        await update.mutateAsync({ id: editing.id, body: changed });
      if (JSON.stringify(suggested) !== JSON.stringify(editing.suggestedAttributeIds)) {
        await suggest.mutateAsync({ id: editing.id, attributeIds: suggested });
      }
      const kept = chartOfCategory(editing);
      const chartBefore = hasContent(kept) ? chartBody(kept) : null;
      const next = charted ? chartBody(chart) : null;
      if (JSON.stringify(next) !== JSON.stringify(chartBefore)) {
        await setChart.mutateAsync({ id: editing.id, chart: next });
      }
      onSaved(null);
    } catch (error) {
      setProblem(error);
    } finally {
      setBusy(false);
    }
  }

  const back = () => {
    setStep('form');
  };

  if (step === 'parent') {
    return (
      <Sheet
        open={open}
        title={t('catParentT')}
        onClose={onClose}
        onBack={back}
        footer={
          <Button wide onClick={back}>
            {t('done')}
          </Button>
        }
      >
        <ParentChoice
          categories={categories}
          self={editing?.id ?? null}
          chosen={draft.parentId}
          onChoose={(parentId) => {
            setDraft({ ...draft, parentId });
          }}
        />
      </Sheet>
    );
  }

  if (step === 'attrs') {
    const query = search.trim().toLowerCase();
    return (
      <Sheet
        open={open}
        title={t('catAttrsT')}
        onClose={onClose}
        onBack={back}
        footer={
          <Button wide onClick={back}>
            {t('done')}
          </Button>
        }
      >
        <p className="text-[14px] text-fg-muted">{t('catAttrsNote')}</p>
        <SearchField
          label={t('searchAttr')}
          placeholder={t('searchAttr')}
          value={search}
          onChange={setSearch}
        />
        <div className="flex-none overflow-hidden rounded-card border border-line">
          {all
            .filter((each) => !each.retired && each.name.toLowerCase().includes(query))
            .map((each) => (
              <div
                key={each.id}
                className="flex min-h-12 items-center border-b border-line px-4 last:border-b-0"
              >
                <CheckRow
                  checked={suggested.includes(each.id)}
                  onChange={() => {
                    setSuggested((current) =>
                      current.includes(each.id)
                        ? current.filter((id) => id !== each.id)
                        : [...current, each.id],
                    );
                  }}
                  title={
                    <>
                      {each.name} <ScopeTag scope={each.scope} />
                    </>
                  }
                />
              </div>
            ))}
        </div>
      </Sheet>
    );
  }

  return (
    <>
      <Sheet
        open={open && !charting}
        title={
          editing ? t('catEdit') : of.kind === 'new' && of.parentId ? t('catSub') : t('catNew')
        }
        onClose={onClose}
        footer={
          <Button wide busy={busy} onClick={() => void save()}>
            {t('save')}
          </Button>
        }
      >
        <CategoryForm
          draft={draft}
          categories={categories}
          isNew={!editing}
          nameError={tried && draft.name.trim() === '' ? t('errName') : problems.name}
          onChange={setDraft}
          onPickParent={() => {
            setStep('parent');
          }}
        />
        {editing ? (
          <>
            <div className="flex flex-col gap-1.5">
              <span className="text-[14px] font-medium text-fg-muted">{t('catSuggest')}</span>
              <div className="flex flex-wrap gap-2">
                {suggested.map((id) => (
                  <Chip
                    key={id}
                    on
                    aria-label={t('removeOption', { name: nameOf(id) })}
                    onClick={() => {
                      setSuggested((current) => current.filter((each) => each !== id));
                    }}
                  >
                    {nameOf(id)}
                    <Icon name="x" size={14} />
                  </Chip>
                ))}
                <Chip
                  className="border-dashed !text-primary"
                  onClick={() => {
                    setSearch('');
                    setStep('attrs');
                  }}
                >
                  <Icon name="plus" size={14} />
                  {t('addAttribute')}
                </Chip>
              </div>
            </div>
            <ChartField
              text={chartText}
              edit
              onOpen={() => {
                setCharting(true);
              }}
            />
            <div className="pt-1">
              <Button
                tone="outline"
                size="sm"
                onClick={() => {
                  onDelete(editing);
                }}
              >
                <span className="inline-flex items-center gap-2 text-danger-text">
                  <Icon name="trash" />
                  {t('catDelete')}
                </span>
              </Button>
            </div>
          </>
        ) : (
          <p className="text-[14px] text-fg-muted">{t('catSlugNote')}</p>
        )}
        {problem !== null && !problems.name ? (
          <p role="alert" className="text-[14px] font-medium text-danger-text">
            {problems.parentId ?? errorText(problem)}
          </p>
        ) : null}
      </Sheet>
      {editing ? (
        <SizeChartSheet
          open={open && charting}
          chart={chart}
          category={null}
          owner={{
            name: draft.name.trim() || editing.name,
            onRemove: charted
              ? () => {
                  setChartDraft(chartOfCategory(null));
                  setCharted(false);
                  setCharting(false);
                }
              : null,
          }}
          readOnly={false}
          onDone={(next) => {
            setChartDraft(next);
            setCharted(hasContent(next));
            setCharting(false);
          }}
          onClose={() => {
            setCharting(false);
          }}
        />
      ) : null}
    </>
  );
}
