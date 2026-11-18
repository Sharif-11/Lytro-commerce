import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Sheet } from '@/components/ui/sheet';
import { NoteLine } from './design-parts';
import { ADDABLE, type AddableKind, type DesignChange, wordsText } from './design-words';
import { EditorIcon, type EditorIconName } from './editor-icon';

// STOREFRONT-BUILDER-PLAN SB-8, SB-9, SB-12: the design page's sheets, as the sketch draws them
// (docs/brand/lytro-storefront-builder.html, `e-add` and `e-publish`), in the dashboard's own sheet.

/** The sketch's `.kind` row: a large icon, a name and a line, and what is on its right. */
function KindRow({
  icon,
  name,
  line,
  end,
}: {
  icon: EditorIconName;
  name: string;
  line?: string;
  end?: React.ReactNode;
}) {
  return (
    <>
      <span className="grid size-[42px] flex-none place-items-center rounded-[12px] bg-primary-soft text-primary">
        <EditorIcon name={icon} size={22} />
      </span>
      <span className="min-w-0 flex-1 text-left">
        <b className="block text-[14.5px] font-bold">{name}</b>
        {line ? <span className="text-[12.5px] text-fg-muted">{line}</span> : null}
      </span>
      {end}
    </>
  );
}

const KIND_ROW =
  'flex w-full items-center gap-3 border-t border-neutral-100 px-0.5 py-[11px] first:border-t-0';

/** SB-9: Add a section -- each kind that fills itself, ready the moment it is added; none past twelve. */
export function AddSheet({
  open,
  full,
  onAdd,
  onClose,
}: {
  open: boolean;
  full: boolean;
  onAdd: (kind: AddableKind) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation('menu');
  return (
    <Sheet open={open} title={t('sdAdd')} onClose={onClose}>
      <div className="flex flex-col gap-2">
        {full ? <NoteLine>{t('sdFull')}</NoteLine> : null}
        <div>
          {ADDABLE.map((kind) => (
            <button
              key={kind.kind}
              type="button"
              disabled={full}
              className={`${KIND_ROW} disabled:opacity-45`}
              onClick={() => {
                onAdd(kind.kind);
              }}
            >
              <KindRow
                icon={kind.icon}
                name={t(kind.name)}
                line={t(kind.line)}
                end={<span className="ml-auto text-[22px] font-semibold text-primary">+</span>}
              />
            </button>
          ))}
        </div>
        <NoteLine>{t('sdAddLater')}</NoteLine>
      </div>
    </Sheet>
  );
}

/** SB-12: Publish? -- what changes against what shoppers see now, then Publish. */
export function PublishSheet({
  open,
  changes,
  busy,
  onPublish,
  onClose,
}: {
  open: boolean;
  changes: DesignChange[];
  busy: boolean;
  onPublish: () => void;
  onClose: () => void;
}) {
  const { t } = useTranslation('menu');
  return (
    <Sheet
      open={open}
      title={t('sdPublishTitle')}
      onClose={onClose}
      footer={
        <>
          <Button tone="outline" onClick={onClose}>
            {t('cancel')}
          </Button>
          <Button busy={busy} onClick={onPublish}>
            {t('sdPublish')}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-1.5">
        {changes.length === 0 ? (
          <p className="py-2 text-[14px] text-fg-muted">{t('sdNoChanges')}</p>
        ) : (
          <ul>
            {changes.map((change, at) => (
              <li key={at} className={KIND_ROW}>
                <KindRow icon={change.icon} name={wordsText(t, change.words)} />
              </li>
            ))}
          </ul>
        )}
        <NoteLine>{t('sdPublishNote')}</NoteLine>
      </div>
    </Sheet>
  );
}
