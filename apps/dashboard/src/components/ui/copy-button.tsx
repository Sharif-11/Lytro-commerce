import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Icon } from '@/components/icon';
import { Button } from './button';
import type { ButtonSize } from './classes';

/**
 * Copy (the prototype's `btn('o xs', t('copy'))` inside a field's end, or `btn('o sm', ic('copy') + ...)` under a new
 * key): it copies the text and says so.
 */
export function CopyButton({
  text,
  size = 'xs',
  icon = false,
}: {
  text: string;
  size?: ButtonSize;
  icon?: boolean;
}): React.JSX.Element {
  const { t } = useTranslation('shell');
  const [copied, setCopied] = useState(false);
  return (
    <Button
      type="button"
      tone="outline"
      size={size}
      onClick={() => {
        void navigator.clipboard.writeText(text).then(() => {
          setCopied(true);
        });
      }}
    >
      {icon ? <Icon name="copy" /> : null}
      {copied ? t('copied') : t('copy')}
    </Button>
  );
}
