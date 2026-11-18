import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { STOREFRONT_THEMES, type StorefrontThemeKey } from '@lytronix/validators';
import { useStorefrontEditor } from '@/api/storefront-design';
import { ErrorBanner } from '@/components/error-banner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { SkeletonRows } from '@/components/ui/skeleton';
import { StatusTag } from '@/components/ui/status-tag';
import { Toast } from '@/components/ui/toast';
import { useToast } from '@/hooks/use-toast';
import { ShellPage } from '@/shell/shell-page';
import type { StorefrontEditor } from '@/types/storefront-design';
import { LeaveWhileSaving, NoteLine, PaletteDots, ThemePicture } from './design-parts';
import { FullPreview, PreviewPane } from './preview-pane';
import { useDraftPreview } from './use-draft-preview';
import { useDraftDesign } from './use-draft';

const THEMES = Object.values(STOREFRONT_THEMES);

/**
 * Settings > Storefront > Design > Change theme (STOREFRONT-BUILDER-PLAN SB-7, the sketch's `e-themes`): the five
 * themes, each as its sample shop looks. Trying one shows the shop in it -- beside the gallery on a desktop, over the
 * whole screen on a phone -- without touching the draft; choosing it puts it in the draft on its first colour set, and
 * keeps the words, photos and sections.
 */
export function ThemesView(): React.JSX.Element {
  const editor = useStorefrontEditor();
  if (!editor.data) {
    return (
      <ShellPage>
        {editor.isError ? (
          <ErrorBanner error={editor.error} />
        ) : (
          <Card flush>
            <SkeletonRows count={5} />
          </Card>
        )}
      </ShellPage>
    );
  }
  return <ThemesPage editor={editor.data} />;
}

function ThemesPage({ editor }: { editor: StorefrontEditor }): React.JSX.Element {
  const { t, i18n } = useTranslation('menu');
  const language = i18n.language === 'en' ? 'en' : 'bn';
  const draft = useDraftDesign(editor);
  const [tried, setTried] = useState<StorefrontThemeKey | null>(null);
  const [full, setFull] = useState(false);
  const preview = useDraftPreview(draft.saved, tried);
  const toast = useToast();
  const current = draft.design.theme;
  const triedName = tried ? STOREFRONT_THEMES[tried].name[language] : '';

  function choose(theme: StorefrontThemeKey): void {
    draft.change({ ...draft.design, theme, palette: 0 });
    setTried(null);
    setFull(false);
    toast.show(t('sdThemeUsed', { name: STOREFRONT_THEMES[theme].name[language] }));
  }

  function cancel(): void {
    setTried(null);
    setFull(false);
  }

  const choices = tried ? (
    <>
      <Button tone="outline" onClick={cancel}>
        {t('cancel')}
      </Button>
      <Button
        onClick={() => {
          choose(tried);
        }}
      >
        {t('sdUseTheme', { name: triedName })}
      </Button>
    </>
  ) : null;

  return (
    <ShellPage>
      {draft.error ? <ErrorBanner error={draft.error} /> : null}
      <div className="flex flex-col gap-section lg:grid lg:grid-cols-[430px_1fr] lg:items-start lg:gap-columns">
        <div className="flex flex-col gap-3">
          <NoteLine>{t('sdThemesNote')}</NoteLine>
          <div className="grid grid-cols-2 gap-2.5">
            {THEMES.map((theme) => {
              const on = theme.key === current;
              return (
                <Card
                  key={theme.key}
                  className={`p-2.5! ${on ? 'border-primary shadow-[inset_0_0_0_2px_var(--color-primary)]' : ''}`}
                >
                  <ThemePicture theme={theme.key} className="h-[250px]" />
                  <h2 className="mt-[9px] flex flex-wrap items-center gap-2 text-[15.5px] font-bold">
                    {theme.name[language]}
                    {on ? <StatusTag tone="ok">{t('sdOn')}</StatusTag> : null}
                  </h2>
                  <p className="mt-0.5 mb-1 text-[12px] text-fg-muted">{theme.suits[language]}</p>
                  <PaletteDots theme={theme.key} chosen={on ? draft.design.palette : null} />
                  {on ? null : (
                    <Button
                      tone="outline"
                      size="sm"
                      wide
                      aria-pressed={tried === theme.key}
                      onClick={() => {
                        setTried(theme.key);
                        if (!window.matchMedia('(min-width: 1024px)').matches) setFull(true);
                      }}
                    >
                      {t('sdTry')}
                    </Button>
                  )}
                </Card>
              );
            })}
          </div>
        </div>
        <div className="hidden lg:sticky lg:top-4 lg:block">
          <PreviewPane
            src={preview}
            heading={tried ? t('sdTrying', { name: triedName }) : undefined}
            footer={
              choices ? (
                <div className="flex w-full justify-end gap-2.5 [&>*]:min-w-40">{choices}</div>
              ) : null
            }
          />
        </div>
      </div>
      <FullPreview
        open={full}
        src={preview}
        heading={tried ? t('sdTrying', { name: triedName }) : undefined}
        footer={choices}
        onClose={cancel}
      />
      <LeaveWhileSaving leaving={draft.leaving} />
      <Toast message={toast.message} />
    </ShellPage>
  );
}
