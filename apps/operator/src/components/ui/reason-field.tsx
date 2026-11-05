import { useTranslation } from 'react-i18next';
import { TextArea } from '@lytronix/ui';

/** The reason the SRS requires, which goes on the platform audit log. */
export function ReasonField({
  label,
  placeholder,
  value,
  onChange,
  error,
}: {
  label?: string;
  placeholder?: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
}): React.JSX.Element {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col gap-1.5">
      <TextArea
        label={label ?? t('shop.reason')}
        name="reason"
        required
        data-autofocus
        placeholder={placeholder}
        error={error}
        value={value}
        onChange={(event) => {
          onChange(event.target.value);
        }}
      />
      <div className="text-[13px] text-fg-muted">{t('shop.reasonHelp')}</div>
    </div>
  );
}
