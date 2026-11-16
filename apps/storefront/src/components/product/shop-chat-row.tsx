import { Icon } from '../icon';
import type { Words } from '@/lib/i18n/words';
import type { ShopChat } from '@/lib/shop/shop-chat';

/** SFT-21 (UI/UX batch 2, 2.2): under the product's buttons, a shopper's way to ask the shop directly -- WhatsApp and
    Messenger, whichever the shop set; neither set, no row. Each opens the app's own chat in a new tab. */
export function ShopChatRow({ chat, words }: { chat: ShopChat; words: Words }) {
  if (!chat.whatsapp && !chat.messenger) return null;
  return (
    <div className="ask">
      <span className="ask-t">{words.t('ask_shop')}</span>
      <div className="ask-b">
        {chat.whatsapp ? (
          <a
            className="btn ghost ask-wa"
            href={chat.whatsapp.href}
            target="_blank"
            rel="noopener noreferrer"
          >
            <Icon name="wa" />
            {words.t('whatsapp')}
          </a>
        ) : null}
        {chat.messenger ? (
          <a
            className="btn ghost ask-ms"
            href={chat.messenger.href}
            target="_blank"
            rel="noopener noreferrer"
          >
            <Icon name="msgr" />
            {words.t('messenger')}
          </a>
        ) : null}
      </div>
    </div>
  );
}
