import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { Card } from '@/components/ui/card';
import { buttonClass } from '@/components/ui/classes';
import { useShell } from '@/shell/shell-context';
import { ShellPage } from '@/shell/shell-page';

/**
 * Brand identity until its editor (BRN-01, the prototype's `brand-soon`): what the editor will do, that it comes in the
 * next update (Slice 11.12), and the add-on, on sale now.
 */
export function BrandSoonView(): React.JSX.Element {
  const { t } = useTranslation('menu');
  const { slug } = useShell();
  return (
    <ShellPage>
      <Card className="flex flex-col items-start gap-2.5">
        <h3 className="mb-1 text-[17px] font-semibold">{t('brSoonTitle')}</h3>
        <p className="text-[14px] text-fg-muted">{t('brSoonLead')}</p>
        <Link to="/$shop/addons" params={{ shop: slug }} className={buttonClass('outline', 'sm')}>
          {t('brSoonAddon')}
        </Link>
      </Card>
    </ShellPage>
  );
}
