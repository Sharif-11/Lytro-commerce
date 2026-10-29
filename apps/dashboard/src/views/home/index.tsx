import { useState } from 'react';
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { useHome } from '@/api/home';
import { Banner } from '@/components/ui/banner';
import { Button } from '@/components/ui/button';
import { useErrorText } from '@/hooks/use-error-text';
import { useShell } from '@/shell/shell-context';
import { ShellPage } from '@/shell/shell-page';
import { doneOf, FIRST_GROUP } from './checklist';
import { JobQueue } from './job-queue';
import { NowTiles } from './now-tiles';
import { SetupChecklist, SetupDone } from './setup-checklist';
import { ShopLinkCard } from './shop-link-card';

const LINK_CARD = 'shop-link';

/**
 * Home (TENANT-DASHBOARD-DESIGN §7.1, the prototype's `home`): what needs the person, in order, and the shop's numbers
 * without a chart, from GET /home in one read. A key spending fast is a banner above it all (RTE-12). On a desktop the
 * queue takes the wide column and the figures, the folded checklist and the link card the 340 px one. The owner's
 * set-up checklist opens the page until its first group is done, then folds into the side column.
 */
export function Home(): React.JSX.Element {
  const { t } = useTranslation('home');
  const errorText = useErrorText();
  const { slug } = useShell();
  const home = useHome();
  const [opened, setOpened] = useState(false);
  const data = home.data;
  const checklist = data?.checklist ?? null;
  const complete = checklist !== null && doneOf(checklist) === FIRST_GROUP;

  return (
    <ShellPage title={null}>
      {data?.fastSpendAlertedAt ? (
        <Banner
          tone="warn"
          action={
            <Link to="/$shop/settings" params={{ shop: slug }}>
              {t('wSeeKeys')}
            </Link>
          }
        >
          {t('fastSpend')}
        </Banner>
      ) : null}
      {home.isError ? (
        <Banner
          tone="bad"
          action={
            <Button
              tone="ghost"
              size="xs"
              onClick={() => {
                void home.refetch();
              }}
            >
              {t('retry')}
            </Button>
          }
        >
          {errorText(home.error)}
        </Banner>
      ) : null}
      <div className="flex flex-col gap-section lg:grid lg:grid-cols-[1fr_340px] lg:items-start lg:gap-columns">
        <div className="flex min-w-0 flex-col gap-section">
          {checklist && (!complete || opened) ? (
            <SetupChecklist checklist={checklist} shareTarget={LINK_CARD} />
          ) : null}
          <JobQueue home={data} />
        </div>
        <div className="flex min-w-0 flex-col gap-section">
          {data ? <NowTiles home={data} /> : null}
          {complete && !opened ? (
            <SetupDone
              onOpen={() => {
                setOpened(true);
              }}
            />
          ) : null}
          <ShopLinkCard id={LINK_CARD} />
        </div>
      </div>
    </ShellPage>
  );
}
