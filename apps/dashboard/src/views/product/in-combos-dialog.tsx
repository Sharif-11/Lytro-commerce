import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { buttonClass } from '@/components/ui/classes';
import { Dialog } from '@/components/ui/dialog';
import { useShell } from '@/shell/shell-context';
import type { InCombo } from './in-combos';

/**
 * A product inside a combo can't be deleted for good (TENANT-DASHBOARD-DESIGN §7.33, `sh-k31-in-combo`,
 * `sh-k31-in-combos`; CMB-08, PRD-13): the dialog names the combo with Open the combo, or all of them with a way into each.
 */
export function InCombosDialog({
  name,
  combos,
  onClose,
}: {
  name: string;
  combos: readonly InCombo[];
  onClose: () => void;
}): React.JSX.Element {
  const { t } = useTranslation('shop');
  const { slug } = useShell();
  const only = combos.length === 1 ? combos[0] : undefined;
  const quoted = combos.map((combo) => `"${combo.name}"`);
  const named =
    quoted.length > 1
      ? `${quoted.slice(0, -1).join(', ')}${t('chAnd')}${quoted[quoted.length - 1] ?? ''}`
      : (quoted[0] ?? '');
  return (
    <Dialog
      open
      title={t('comboInT', { name })}
      onClose={onClose}
      actions={
        <>
          <Button tone="outline" onClick={onClose}>
            {t('comboOk')}
          </Button>
          {combos.map((combo) => (
            <Link
              key={combo.id}
              to="/$shop/products/$productId"
              params={{ shop: slug, productId: combo.id }}
              className={buttonClass('primary', 'md')}
              onClick={onClose}
            >
              {only ? t('comboOpen') : t('comboOpenThe', { name: combo.name })}
            </Link>
          ))}
        </>
      }
    >
      {only ? t('comboInP', { combo: only.name }) : t('comboInManyP', { combos: named })}
    </Dialog>
  );
}
