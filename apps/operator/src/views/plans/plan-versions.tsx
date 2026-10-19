import { useTranslation } from 'react-i18next';
import { Card, CardTitle } from '@/components/ui/fields';
import { formatDateTime } from '@/lib/dates';
import type { PlanVersion } from '@/types/operator';

/** PLN-02: the prior versions a plan edit snapshotted, read-only. */
export function PlanVersions({
  versions,
  loading,
}: {
  versions: PlanVersion[] | undefined;
  loading: boolean;
}): React.JSX.Element {
  const { t, i18n } = useTranslation();
  return (
    <Card>
      <CardTitle>{t('plans.versionsTitle')}</CardTitle>
      {loading ? <p className="mt-2 text-[13px] text-fg-muted">{t('common.loading')}</p> : null}
      {versions && versions.length === 0 ? (
        <p className="mt-2 text-[13px] text-fg-muted">{t('plans.noVersions')}</p>
      ) : null}
      {versions && versions.length > 0 ? (
        <ul className="num mt-2 space-y-1 text-[13px] text-fg-muted">
          {versions.map((version) => (
            <li key={version.id}>
              {t('plans.versionLine', {
                version: version.version,
                name: version.name,
                date: formatDateTime(version.recordedAt, i18n.language),
              })}
            </li>
          ))}
        </ul>
      ) : null}
    </Card>
  );
}
