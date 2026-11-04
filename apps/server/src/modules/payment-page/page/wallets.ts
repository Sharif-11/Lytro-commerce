import { PaymentMethod, WalletAccountType } from '@lytronix/validators';
import { html, type SafeHtml } from './html';
import type { PageWords } from './words';

/** PAYMENT-PAGE-DESIGN §1.4, §1.5: what the page needs to know of a wallet. Its colour is in page.css, as `.w-<method>`. */
interface WalletFacts {
  name: string;
  /** The name as the wallet's own menus write it. */
  upper: string;
  ussd: string;
  /** Its official mark's file among the page's assets, or text in its colour until the mark is fetched. */
  markFile: string | null;
  markText: readonly [string, string] | null;
}

const WALLETS: Readonly<Partial<Record<PaymentMethod, WalletFacts>>> = {
  [PaymentMethod.Bkash]: {
    name: 'bKash',
    upper: 'BKASH',
    ussd: '*247#',
    markFile: 'bkash.png',
    markText: null,
  },
  [PaymentMethod.Nagad]: {
    name: 'Nagad',
    upper: 'NAGAD',
    ussd: '*167#',
    markFile: 'nagad.png',
    markText: null,
  },
  [PaymentMethod.Rocket]: {
    name: 'Rocket',
    upper: 'ROCKET',
    ussd: '*322#',
    markFile: null,
    markText: ['Rocket', 'Rocket'],
  },
  [PaymentMethod.Upay]: {
    name: 'Upay',
    upper: 'UPAY',
    ussd: '*268#',
    markFile: null,
    markText: ['উপায়', 'উপায়'],
  },
};

/** PAY-05: the verb an account type takes. */
const VERBS: Readonly<Record<WalletAccountType, string>> = {
  [WalletAccountType.Personal]: 'Send Money',
  [WalletAccountType.Agent]: 'Cash Out',
  [WalletAccountType.Merchant]: 'Payment',
};

export function walletName(method: PaymentMethod, words: PageWords): string {
  return WALLETS[method]?.name ?? words.of('bankTile');
}

export function verbOf(type: WalletAccountType | null): string {
  return VERBS[type ?? WalletAccountType.Personal];
}

/** The wallet's mark, as the picker's tile and a wallet's header show it. */
export function markOf(method: PaymentMethod, words: PageWords): SafeHtml {
  const wallet = WALLETS[method];
  if (wallet?.markFile) {
    return html`<img src="/assets/${wallet.markFile}" alt="${wallet.name}" />`;
  }
  const text = wallet?.markText
    ? words.either(wallet.markText[0], wallet.markText[1])
    : words.of('bankTile');
  return html`<span class="txt mark-${method}">${text}</span>`;
}

const highlight = (text: string | number): SafeHtml => html`<b class="hl">${text}</b>`;

function recipientLead(type: WalletAccountType | null, words: PageWords): string {
  if (type === WalletAccountType.Agent) {
    return words.either('এজেন্ট নম্বর হিসেবে এই নম্বরটি লিখুন:', 'Enter this as the agent number:');
  }
  if (type === WalletAccountType.Merchant) {
    return words.either(
      'মার্চেন্ট নম্বর হিসেবে এই নম্বরটি লিখুন:',
      'Enter this as the merchant number:',
    );
  }
  return words.either(
    'প্রাপক নম্বর হিসেবে এই নম্বরটি লিখুন:',
    'Enter this as the recipient number:',
  );
}

/** PAYMENT-PAGE-DESIGN §1.4: the steps as each wallet's own app words them, with the shop's number and the amount in. */
export function stepsOf(
  method: PaymentMethod,
  type: WalletAccountType | null,
  amount: string,
  numberLine: (lead: string) => SafeHtml,
  words: PageWords,
): SafeHtml[] {
  const wallet = WALLETS[method];
  if (!wallet) return [];
  const verb = highlight(`"${verbOf(type)}"`);
  const open = highlight(wallet.ussd);
  const upper = highlight(wallet.upper);
  const submit = highlight('SUBMIT');
  const id = highlight('Transaction ID');
  const verify = highlight(words.either('ভেরিফাই', 'VERIFY'));
  const amountLine = words.either(
    html`পরিমাণ: ${highlight(amount)} টাকা দিয়ে ${submit} করুন।`,
    html`Amount: ${highlight(amount)} taka, then ${submit}.`,
  );
  if (method === PaymentMethod.Bkash) {
    return [
      words.either(
        html`${open} ডায়াল করে আপনার ${upper} মোবাইল মেনুতে যান অথবা ${upper} অ্যাপে যান।`,
        html`Dial ${open} to open your ${upper} mobile menu, or open the ${upper} app.`,
      ),
      words.either(html`${verb} -এ ক্লিক করুন।`, html`Tap ${verb}.`),
      numberLine(recipientLead(type, words)),
      amountLine,
      words.either(
        html`এখন উপরের বক্সে আপনার ${id} দিন এবং ${verify} করুন।`,
        html`Now enter your ${id} in the box above and ${verify}.`,
      ),
    ];
  }
  const recipient = numberLine(
    type === null || type === WalletAccountType.Personal
      ? words.either('প্রাপক নম্বর:', 'Recipient number:')
      : recipientLead(type, words),
  );
  const verifyLine = words.either(
    html`${id} দিয়ে ${verify} করুন।`,
    html`Enter the ${id} and ${verify}.`,
  );
  if (method === PaymentMethod.Nagad) {
    return [
      words.either(
        html`${open} ডায়াল করে আপনার ${upper} মোবাইল মেনুতে যান অথবা অ্যাপে যান।`,
        html`Dial ${open} to open your ${upper} mobile menu, or open the app.`,
      ),
      words.either(html`${verb} এ ক্লিক করুন।`, html`Tap ${verb}.`),
      recipient,
      amountLine,
      verifyLine,
    ];
  }
  return [
    words.either(
      html`${open} অথবা ${upper} অ্যাপে যান।`,
      html`Dial ${open} or open the ${upper} app.`,
    ),
    words.either(
      method === PaymentMethod.Rocket ? html`${verb} নির্বাচন করুন।` : html`${verb} সিলেক্ট করুন।`,
      html`Select ${verb}.`,
    ),
    recipient,
    amountLine,
    verifyLine,
  ];
}
