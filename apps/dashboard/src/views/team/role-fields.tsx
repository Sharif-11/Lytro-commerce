import { useTranslation } from 'react-i18next';
import { NAME_MAX_LENGTH } from '@lytronix/validators';
import { CheckRow } from '@/components/ui/check-row';
import { Field } from '@/components/ui/field';
import { PERMISSION_ROWS, toggled, type RoleDraft } from './team-words';

/**
 * The role editor's fields (STF-07, the prototype's Parts 11 and 12): the role's name, then what it may do, one
 * sentence a permission, "Spends the balance" under paying. The Roles page and Add staff's New role step both use it;
 * each row is the container's own child, so the card's 10 px or the sheet's 16 px sets them apart, as drawn.
 */
export function RoleFields({
  draft,
  onChange,
  nameError,
  readOnly = false,
}: {
  draft: RoleDraft;
  onChange: (draft: RoleDraft) => void;
  nameError?: string | null;
  readOnly?: boolean;
}): React.JSX.Element {
  const { t } = useTranslation('menu');
  return (
    <>
      <Field
        label={t('roleName')}
        name="roleName"
        placeholder={t('roleNamePh')}
        maxLength={NAME_MAX_LENGTH}
        autoComplete="off"
        readOnly={readOnly}
        value={draft.name}
        error={nameError}
        onChange={(event) => {
          onChange({ ...draft, name: event.target.value });
        }}
      />
      {PERMISSION_ROWS.map((row) => (
        <CheckRow
          key={row.permission}
          checked={draft.permissions.includes(row.permission)}
          disabled={readOnly}
          title={t(row.label)}
          sub={row.note ? t(row.note) : undefined}
          onChange={() => {
            onChange(toggled(draft, row.permission));
          }}
        />
      ))}
    </>
  );
}
