import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { MediaPurpose } from '@lytronix/validators';
import { useStorageUsage } from '@/api/media';
import { Icon } from '@/components/icon';
import { Button } from '@/components/ui/button';
import { Sheet } from '@/components/ui/sheet';
import { BLANK_CHART, type ChartForm } from '@/lib/product-settings';
import { ChoiceList, ChoiceRow } from './choice-list';
import { UploadTile } from './upload-tile';
import { usePictureUpload } from './use-picture-upload';

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

/** A kept table with something typed in it (the corner aside). */
const hasTable = (rows: string[][]): boolean =>
  rows.some((row, at) => row.some((cell, col) => (at > 0 || col > 0) && cell.trim() !== ''));

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
    setDraft(
      chart.mode === 'table' && !hasTable(chart.rows) ? { ...chart, mode: 'picture' } : chart,
    );
    pictureUpload.dismiss();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function attach(file: File): Promise<void> {
    const media = await pictureUpload.start(file);
    if (!media) return;
    setDraft((current) => ({
      ...current,
      mode: 'picture',
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
              {/* The owner, 2026-11-25: "size chart is image only" -- the table form is switched off here, not on the
                  server, so a chart already kept as a table shows to shoppers as it is until a picture replaces it. */}
              {draft.mode === 'table' ? (
                <p className="text-[14px] text-fg-muted">{t('chartTableKept')}</p>
              ) : null}
              {
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
              }
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
