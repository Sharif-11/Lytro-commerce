import { useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { Permission } from '@lytronix/validators';
import { Icon, type IconName } from '@/components/icon';
import { PhasePill } from '@/components/ui/page';
import { Sheet } from '@/components/ui/sheet';
import { allows } from './hubs';
import { useShell } from './shell-context';

interface PlusAction {
  icon: IconName;
  label: string;
  run: () => void;
}

const tileClass =
  'flex flex-col items-start gap-2.5 rounded-card border border-line bg-surface p-4 text-left text-[15px] font-medium';

function Tile({
  icon,
  children,
}: {
  icon: IconName;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <>
      <span className="flex size-10 items-center justify-center rounded-[10px] bg-info-soft text-info">
        <Icon name={icon} />
      </span>
      {children}
    </>
  );
}

/**
 * TENANT-DASHBOARD-DESIGN §4.5, the prototype's `plus` sheet: the things a seller starts most, as tiles -- two to a
 * row on a phone, three from 640 px. Add product (Slice 11.7a) and Top up today; Add stock joins with its screen (Slice
 * 11.9), and New order shows what Phase 4 brings. Tiles a person cannot use are hidden (STF-11).
 */
export function PlusMenu({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}): React.JSX.Element {
  const { t } = useTranslation('shell');
  const { slug, viewer } = useShell();
  const navigate = useNavigate();
  const actions: PlusAction[] = [];
  if (allows(viewer, [Permission.ProductsManage])) {
    actions.push({
      icon: 'tag',
      label: t('pProduct'),
      run: () => {
        void navigate({ to: '/$shop/products/new', params: { shop: slug } });
      },
    });
  }
  if (allows(viewer, [Permission.BalanceManage])) {
    actions.push({
      icon: 'money',
      label: t('pTopup'),
      run: () => {
        void navigate({ to: '/$shop/balance', params: { shop: slug }, search: { topup: 1 } });
      },
    });
  }
  return (
    <Sheet open={open} title={t('plusTitle')} onClose={onClose}>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {actions.map((action) => (
          <button
            key={action.label}
            type="button"
            className={tileClass}
            onClick={() => {
              onClose();
              action.run();
            }}
          >
            <Tile icon={action.icon}>{action.label}</Tile>
          </button>
        ))}
        <div aria-disabled="true" className={`${tileClass} opacity-55`}>
          <Tile icon="orders">{t('pOrder')}</Tile>
          <PhasePill>{t('laterPhase', { p: t('phase4') })}</PhasePill>
        </div>
      </div>
    </Sheet>
  );
}
