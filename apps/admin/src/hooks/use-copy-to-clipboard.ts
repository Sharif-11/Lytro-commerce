import { useState } from 'react';

/** Copies text to the clipboard and reports back briefly whether it worked — used by both the TOTP secret
    and the backup codes (operator enrollment), so it's one hook instead of two copies of the same
    try/catch-and-reset-after-a-beat logic. */
export function useCopyToClipboard(): [copied: boolean, copy: (text: string) => void] {
  const [copied, setCopied] = useState(false);

  function copy(text: string): void {
    void navigator.clipboard
      .writeText(text)
      .then(() => {
        setCopied(true);
        setTimeout(() => {
          setCopied(false);
        }, 2000);
      })
      .catch(() => {
        /* Clipboard access can be denied/unavailable — the text is still shown on screen either way. */
      });
  }

  return [copied, copy];
}
