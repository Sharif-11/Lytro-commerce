import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  MediaPurpose,
  SIZE_CHART_CELL_MAX_LENGTH,
  SIZE_CHART_MAX_COLUMNS,
  SIZE_CHART_MAX_ROWS,
} from '@lytronix/validators';
import { useStorageUsage } from '@/api/media';
import { Icon } from '@/components/icon';
import { Button } from '@/components/ui/button';
import { Sheet } from '@/components/ui/sheet';
import { BLANK_CHART, type ChartForm } from '@/lib/product-settings';
import { ChoiceList, ChoiceRow } from './choice-list';
import { UploadTile } from './upload-tile';
import { usePictureUpload } from './use-picture-upload';
import { Segments } from './value-sheet';

/**
 * A table as kept: its corner empty, as drawn (a category's chart it started from may name it), and without the rows
 * and columns left empty, keeping at least one cell (PRD-17's limits are on what is kept).
 */
function trimmed(rows: string[][]): string[][] {
  const kept = rows
    .map((row, index) => (index === 0 ? ['', ...row.slice(1)] : row))
    .filter((row) => row.some((cell) => cell.trim() !== ''));
  const width = Math.max(1, ...kept.map((row) => row.length));
  const columns = Array.from({ length: width }, (_, index) => index).filter((index) =>
    kept.some((row) => (row[index] ?? '').trim() !== ''),
  );
  const table = kept.map((row) => columns.map((index) => row[index] ?? ''));
  return table.length > 0 && columns.length > 0 ? table : BLANK_CHART;
}

/**
 * Size chart (§7.4's sheet, Part 15's `sh-sizechart` and `sh-sizechart-picture`; PRD-17): the category's chart, or the
 * product's own -- a table, its first row naming the measures and its first column the sizes, typed like any cell, or a
 * picture of the shop's. Up to 15 rows by 10 columns, 40 characters a cell. Rows and columns left empty are dropped.
 * Done keeps it; the product saves it with Save. A category's own chart (Part 19's `sh-category-chart-19`) is the same
 * editor under the category's name, with what it is shown on and a way to remove it; the category sheet saves it.
 */
export function SizeChartSheet({
  open,
  chart,
  category,
  owner = null,
  readOnly,
  onDone,
  onClose,
}: {
  open: boolean;
  chart: ChartForm;
  /** The chart its category gives, by the category's name; null when none does. */
  category: { name: string } | null;
  /** The category whose own chart this is, and its removal while it has one; null for a product's. */
  owner?: { name: string; onRemove: (() => void) | null } | null;
  readOnly: boolean;
  onDone: (chart: ChartForm) => void;
  onClose: () => void;
}): React.JSX.Element {
  const { t } = useTranslation('shop');
  const picture = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState<ChartForm>(chart);
  // §7.43: the picture's upload says how far it is, and Done waits for it.
  const pictureUpload = usePictureUpload(MediaPurpose.SizeChartImage);
  const uploading = pictureUpload.busy;
  const storage = useStorageUsage({ enabled: pictureUpload.upload?.stage === 'refused' });

  useEffect(() => {
    if (!open) return;
    setDraft(chart);
    pictureUpload.dismiss();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const rows = draft.rows;
  const width = rows[0]?.length ?? 1;
  const setCell = (row: number, col: number, value: string) => {
    setDraft({
      ...draft,
      rows: rows.map((cells, at) =>
        at === row ? cells.map((cell, index) => (index === col ? value : cell)) : cells,
      ),
    });
  };

  async function attach(file: File): Promise<void> {
    const media = await pictureUpload.start(file);
    if (!media) return;
    setDraft((current) => ({
      ...current,
      image: { id: media.id, urls: media.urls ?? { main: '', thumbnail: '' } },
    }));
  }

  return (
    <Sheet
      open={open}
      title={owner ? `${t('chartTitle')} · ${owner.name}` : t('chartTitle')}
      onClose={onClose}
      footer={
        readOnly ? undefined : (
          <Button
            wide
            disabled={uploading}
            onClick={() => {
              onDone(draft.mode === 'table' ? { ...draft, rows: trimmed(draft.rows) } : draft);
            }}
          >
            {t('done')}
          </Button>
        )
      }
    >
      {open ? (
        <div className="flex flex-col gap-3">
          {owner ? (
            <p className="text-[14px] text-fg-muted">{t('catChartHint')}</p>
          ) : (
            <ChoiceList label={t('chartTitle')}>
              <ChoiceRow
                on={!draft.own}
                disabled={readOnly}
                title={category ? `${t('chartUseCat')} · ${category.name}` : t('chartNone')}
                onChoose={() => {
                  setDraft({ ...draft, own: false });
                }}
              />
              <ChoiceRow
                on={draft.own}
                disabled={readOnly}
                title={t('chartOwn')}
                onChoose={() => {
                  setDraft({ ...draft, own: true });
                }}
              />
            </ChoiceList>
          )}
          {owner || draft.own ? (
            <>
              <Segments
                label={t('chartTitle')}
                value={draft.mode}
                choices={[
                  { value: 'table', label: t('chartTable') },
                  { value: 'picture', label: t('chartPicture') },
                ]}
                onChange={(mode) => {
                  if (!readOnly) setDraft({ ...draft, mode });
                }}
              />
              {draft.mode === 'table' ? (
                <>
                  <div className="-mx-4 overflow-x-auto px-4">
                    <table className="min-w-full border-collapse text-[14px]">
                      <tbody>
                        {rows.map((cells, row) => (
                          <tr key={row}>
                            {cells.map((cell, col) => (
                              <td
                                key={col}
                                className={[
                                  'border-b border-line px-2.5 py-2 text-left whitespace-nowrap',
                                  col === 0 ? 'sticky left-0 z-[1] bg-surface' : '',
                                ].join(' ')}
                              >
                                {/* As drawn, the corner above the sizes and beside the measures stays empty. */}
                                {row === 0 && col === 0 ? (
                                  <span className="block w-[52px]" />
                                ) : (
                                  <input
                                    aria-label={t('chartCell', { row: row + 1, col: col + 1 })}
                                    value={cell}
                                    maxLength={SIZE_CHART_CELL_MAX_LENGTH}
                                    readOnly={readOnly}
                                    className={[
                                      'h-9 rounded-[6px] border border-line-strong bg-surface px-2 outline-none focus:outline-2 focus:outline-offset-1 focus:outline-focus',
                                      col === 0
                                        ? 'w-[52px] font-semibold'
                                        : row === 0
                                          ? 'w-[72px] font-semibold'
                                          : 'num w-[72px] text-right',
                                    ].join(' ')}
                                    onChange={(event) => {
                                      setCell(row, col, event.target.value);
                                    }}
                                  />
                                )}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {readOnly ? null : (
                    <div className="flex flex-wrap gap-2">
                      <Button
                        tone="outline"
                        size="sm"
                        disabled={rows.length >= SIZE_CHART_MAX_ROWS}
                        onClick={() => {
                          setDraft({ ...draft, rows: [...rows, Array<string>(width).fill('')] });
                        }}
                      >
                        <Icon name="plus" />
                        {t('addRow')}
                      </Button>
                      <Button
                        tone="outline"
                        size="sm"
                        disabled={width >= SIZE_CHART_MAX_COLUMNS}
                        onClick={() => {
                          setDraft({ ...draft, rows: rows.map((cells) => [...cells, '']) });
                        }}
                      >
                        <Icon name="plus" />
                        {t('addCol')}
                      </Button>
                    </div>
                  )}
                  <p className="text-[14px] text-fg-muted">
                    {t('chartNames')} {t('chartLimit')}
                  </p>
                </>
              ) : (
                <>
                  {pictureUpload.upload ? (
                    <UploadTile
                      upload={pictureUpload.upload}
                      storage={storage.data}
                      panel
                      onDismiss={pictureUpload.dismiss}
                    />
                  ) : draft.image ? (
                    <div className="overflow-hidden rounded-card border border-line bg-neutral-100">
                      <img
                        src={draft.image.urls.main}
                        alt={t('chartTitle')}
                        className="h-[220px] w-full object-contain"
                      />
                    </div>
                  ) : null}
                  {readOnly ? null : (
                    <div className="flex flex-wrap gap-2">
                      <Button
                        tone="outline"
                        size="sm"
                        disabled={uploading}
                        onClick={() => picture.current?.click()}
                      >
                        <Icon name="camera" />
                        {draft.image ? t('replace') : t('chartAddPicture')}
                      </Button>
                      {draft.image && !uploading ? (
                        <Button
                          tone="outline"
                          size="sm"
                          onClick={() => {
                            setDraft({ ...draft, image: null });
                          }}
                        >
                          <span className="text-danger-text">{t('remove')}</span>
                        </Button>
                      ) : null}
                    </div>
                  )}
                  <p className="text-[14px] text-fg-muted">{t('chartPicHint')}</p>
                  <input
                    ref={picture}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    hidden
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (file) void attach(file);
                      event.target.value = '';
                    }}
                  />
                </>
              )}
            </>
          ) : null}
          {owner?.onRemove && !readOnly ? (
            <p>
              <button
                type="button"
                className="text-[14px] font-semibold text-danger-text underline"
                onClick={owner.onRemove}
              >
                {t('chartRemove')}
              </button>
            </p>
          ) : null}
        </div>
      ) : null}
    </Sheet>
  );
}
