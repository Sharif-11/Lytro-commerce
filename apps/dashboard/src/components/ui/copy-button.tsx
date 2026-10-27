import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from './button';

/** Copy, inside a field's end (the prototype's `btn('o xs', t('copy'))`): it copies the text and says so. */
export function CopyButton({ text }: { text: string }): React.JSX.Element {
  const { t } = useTranslation('shell');
  const [copied, setCopied] = useState(false);
  return (
    <Button
      type="button"
      tone="outline"
      size="xs"
      onClick={() => {
        void navigator.clipboard.writeText(text).then(() => {
          setCopied(true);
        });
      }}
    >
      {copied ? t('copied') : t('copy')}
    </Button>
  );
}
