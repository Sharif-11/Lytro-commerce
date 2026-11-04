import {
  bdMobileNumber,
  GatewayResult,
  PaymentMethod,
  PaymentPageReportReason,
  PaymentRejectReason,
  PaymentSessionSource,
} from '@lytronix/validators';
import type { ShopperPaymentMethod } from '../../payment-methods/types/payment-methods';
import { html, type HtmlPart, type SafeHtml } from './html';
import {
  chosenMethodOf,
  closeAddressOf,
  returnAddressOf,
  screenOf,
  WAITING_SCREENS,
  type PageAsk,
  type PageData,
  type PageScreen,
} from './screens';
import { markOf, stepsOf, verbOf, walletName } from './wallets';
import { PageWords, type PageLanguage } from './words';

/** What the shopper typed, drawn again with what was wrong with it. */
export interface TypedForm {
  transactionId: string;
  senderNumber: string;
  problem: 'used' | 'shape' | 'sender' | null;
}

/** The report sheet drawn again, open, when its note was left out. */
export interface TypedReport {
  reason: PaymentPageReportReason;
  note: string;
}

export interface PageAssets {
  css: string;
  js: string;
}

interface Chrome {
  title: string;
  screen: string;
  language: PageLanguage;
  assets: PageAssets;
  head?: HtmlPart;
  bodyClass?: string;
  ref?: string;
  /** PAY-17: this page keeps checking the session. */
  poll?: boolean;
  /** PAY-08: where this page returns to, in a few seconds. */
  returnTo?: string;
}

/** TEN-16: a monogram is the name's first letter as a reader sees it, a Bangla letter with its marks whole. */
function firstLetter(name: string): string {
  for (const { segment } of new Intl.Segmenter().segment(name)) return segment;
  return '';
}

function amountText(amount: string): string {
  return Number(amount).toLocaleString('en-US', { maximumFractionDigits: 2 });
}

/** Bangladesh's own time, whatever the server's clock is set to. */
function timeText(when: Date): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Dhaka',
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(when);
}

function minutesLeft(expiresAt: Date, now: Date): string {
  const seconds = Math.max(Math.floor((expiresAt.getTime() - now.getTime()) / 1000), 0);
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}

const ICONS = {
  back: html`<path d="M19 12H5" /><path d="m12 19-7-7 7-7" />`,
  x: html`<path d="M18 6 6 18" /><path d="m6 6 12 12" />`,
  copy: html`<rect width="14" height="14" x="8" y="8" rx="2" /><path
      d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"
    />`,
  chat: html`<path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z" /><path
      d="M9.5 9.5c0 2.5 3 5.5 5.5 5.5l1.5-1.5-2-1.5-1 1a4.5 4.5 0 0 1-2.5-2.5l1-1-1.5-2Z"
    />`,
  phone: html`<path
    d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"
  />`,
  check: html`<path d="M20 6 9 17l-5-5" />`,
  clock: html`<circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" />`,
  search: html`<circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />`,
  lock: html`<rect width="18" height="11" x="3" y="11" rx="2" ry="2" /><path
      d="M7 11V7a5 5 0 0 1 10 0v4"
    />`,
  user: html`<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />`,
} as const;
type IconName = keyof typeof ICONS;

const icon = (name: IconName, size = 'i'): SafeHtml =>
  html`<svg class="i ${size}" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name]}</svg>`;

function page(chrome: Chrome, body: HtmlPart): string {
  return html`<!doctype html>
    <html lang="${chrome.language}">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="robots" content="noindex" />
        <title>${chrome.title}</title>
        <link rel="stylesheet" href="${chrome.assets.css}" />
        <script src="${chrome.assets.js}" defer></script>
        ${chrome.head}
      </head>
      <body
        class="${chrome.bodyClass ?? ''}"
        data-screen="${chrome.screen}"
        ${chrome.ref ? html`data-ref="${chrome.ref}"` : ''}
        ${chrome.poll ? html`data-poll="1"` : ''}
        ${chrome.returnTo ? html`data-return="${chrome.returnTo}"` : ''}
      >
        ${body}
      </body>
    </html>`.text;
}

/** One page's drawing, with what it needs at hand. */
class PageDrawing {
  private readonly words: PageWords;
  private readonly screen: PageScreen;

  constructor(
    private readonly data: PageData,
    private readonly ask: PageAsk,
    private readonly now: Date,
    private readonly assets: PageAssets,
    private readonly typed: TypedForm | null,
    private readonly typedReport: TypedReport | null,
  ) {
    this.words = new PageWords(ask.language);
    this.screen = screenOf(data, ask, now);
  }

  private get session(): PageData['session'] {
    return this.data.session;
  }

  /** This page's own address, in this language, with what is asked of it. */
  private address(query: Readonly<Record<string, string>> = {}): string {
    const parts = new URLSearchParams(query);
    if (this.ask.language === 'en') parts.set('lang', 'en');
    const text = parts.toString();
    return `/${this.data.ref}${text === '' ? '' : `?${text}`}`;
  }

  private walletAddress(method: PaymentMethod, hand = false): string {
    return this.address({ w: method, ...(hand ? { hand: '1' } : {}) });
  }

  /** The address again in the other language, with everything else it asked. */
  private otherLanguageAddress(): string {
    const parts = new URLSearchParams();
    if (this.ask.wallet) parts.set('w', this.ask.wallet);
    if (this.ask.pick) parts.set('pick', '1');
    if (this.ask.hand) parts.set('hand', '1');
    if (this.ask.change) parts.set('change', '1');
    if (this.ask.just) parts.set('just', '1');
    if (this.ask.language === 'bn') parts.set('lang', 'en');
    const text = parts.toString();
    return `/${this.data.ref}${text === '' ? '' : `?${text}`}`;
  }

  private topbar(back: string | null, close: string | null): SafeHtml {
    return html`<div class="topbar">
      <a
        class="${back ? '' : 'hide'}"
        aria-label="${this.words.of('back')}"
        ${back ? html`href="${back}"` : ''}
        >${icon('back', 'i28')}</a
      >
      <a
        class="${close ? '' : 'hide'}"
        aria-label="${this.words.of('close')}"
        ${close ? html`href="${close}"` : ''}
        >${icon('x', 'i28')}</a
      >
    </div>`;
  }

  private legal(bare = false): SafeHtml {
    return html`<p class="legal">
      🔒 Secured by Lytro · ${this.words.of('secured')}
      ${bare ? '' : html` · <a href="#report">${this.words.of('report')}</a>`} ·
      <a href="${this.otherLanguageAddress()}">${this.words.of('otherLanguage')}</a>
    </p>`;
  }

  /** WhatsApp and call, from the shop's contact phone; left out when it isn't set (agreed 2026-11-04). */
  private contacts(tight = false): SafeHtml | null {
    const phone = this.data.shop.contactPhone;
    if (phone === null) return null;
    const mobile = bdMobileNumber(phone);
    return html`<div class="contacts ${tight ? 'tight' : ''}">
      ${
        mobile === null
          ? ''
          : html`<a
              class="c-wa"
              aria-label="WhatsApp"
              href="https://wa.me/88${mobile}"
              rel="noopener noreferrer"
              >${icon('chat')}</a
            >`
      }
      <a class="c-call" aria-label="${this.words.of('call')}" href="tel:${phone}"
        >${icon('phone')}</a
      >
    </div>`;
  }

  private help(): SafeHtml | null {
    const buttons = this.contacts(true);
    return buttons === null
      ? null
      : html`<p class="help">${this.words.of('help')}</p>
          ${buttons}`;
  }

  private gatewayCard(method: PaymentMethod): SafeHtml | null {
    const result = this.session.gatewayResult;
    if (result === null) return null;
    const w = walletName(method, this.words);
    return html`<div class="gwcard">
      <h2>${this.words.of(result === GatewayResult.Failed ? 'gwFailT' : 'gwCancelT', { w })}</h2>
      <p>${this.words.of('gwP')}</p>
      <div class="row">
        <a class="gwbtn w-${method}" href="${this.walletAddress(method)}"
          >${this.words.of('gwRetry', { w })}</a
        >
        <a class="gwbtn line" href="${this.walletAddress(method, true)}"
          >${this.words.of('gwHand')}</a
        >
      </div>
    </div>`;
  }

  private picker(): SafeHtml {
    const { session, shop } = this.data;
    const wallets = session.methods.filter((row) => row.method !== PaymentMethod.Bank);
    const banks = session.methods.filter((row) => row.method === PaymentMethod.Bank);
    const tile = (row: ShopperPaymentMethod): SafeHtml =>
      html`<a class="tile" href="${this.walletAddress(row.method)}"
        >${markOf(row.method, this.words)}</a
      >`;
    return html`<h1 class="vh">${this.words.of('title')}</h1>
      ${session.test ? html`<div class="testbar">${this.words.of('test')}</div>` : ''}
      <div class="brandrow">
        <span class="logo">
          ${
            shop.logoUrl
              ? html`<img src="${shop.logoUrl}" alt="" />`
              : html`<span class="mono">${firstLetter(shop.name)}</span>`
          }
        </span>
        <div>
          <div class="nm">${shop.name}</div>
          <div class="ref">${this.words.of('orderRef', { o: session.orderNumber })}</div>
          <a class="pill" href="#details">${this.words.of('viewDetails')}</a>
        </div>
      </div>
      ${this.contacts()} ${session.method === null ? '' : this.gatewayCard(session.method)}
      ${
        wallets.length === 0
          ? ''
          : html`<div class="sect">${this.words.of('mobileBanking')}</div>
              <div class="tiles">${wallets.map(tile)}</div>`
      }
      ${
        banks.length === 0
          ? ''
          : html`<div class="sect">${this.words.of('bankTransfer')}</div>
              <div class="tiles">${banks.map(tile)}</div>`
      }
      <div class="paybar">${this.words.of('pay', { a: amountText(session.amount) })}</div>
      <p class="timeleft">
        ${this.words.of('timeLeft')}
        <span data-expires="${session.expiresAt.toISOString()}"
          >${minutesLeft(session.expiresAt, this.now)}</span
        >
      </p>
      ${this.legal()}`;
  }

  private countdown(): SafeHtml {
    const { expiresAt } = this.session;
    return html`<span class="cd"
      >${icon('clock', 'i14')}<span data-expires="${expiresAt.toISOString()}"
        >${minutesLeft(expiresAt, this.now)}</span
      ></span
    >`;
  }

  private note(lead: string, text: string, kind: 'note' | 'shopnote'): SafeHtml {
    return html`<div class="${kind}"><b>${lead}</b> ${text}</div>`;
  }

  private copyButton(value: string, label: string): SafeHtml {
    return html`<button
      class="copy"
      type="button"
      data-copy="${value}"
      data-copied="${this.words.of('copiedNo', { n: label })}"
    >
      ${icon('copy', 'i16')}${this.words.of('copy')}
    </button>`;
  }

  private problemWord(method: ShopperPaymentMethod): string | null {
    const problem = this.typed?.problem ?? null;
    if (problem === 'used') return this.words.of('dupErr');
    if (problem === 'shape') {
      return this.words.of(method.method === PaymentMethod.Bank ? 'badRef' : 'badShape');
    }
    if (problem === 'sender') return this.words.of('badSender');
    return null;
  }

  private walletHead(method: ShopperPaymentMethod): SafeHtml {
    return html`<div class="whead">
      <span class="lbox">${markOf(method.method, this.words)}</span>
      <span class="amt"><i></i><b>${amountText(this.session.amount)} ৳</b></span>
    </div>`;
  }

  private hiddenFields(method: ShopperPaymentMethod): SafeHtml {
    return html`<input type="hidden" name="method" value="${method.method}" />
      <input type="hidden" name="lang" value="${this.ask.language}" />`;
  }

  private walletPanel(method: ShopperPaymentMethod): SafeHtml {
    const typedId = this.typed?.transactionId ?? '';
    const typedSender = this.typed?.senderNumber ?? '';
    const problem = this.problemWord(method);
    const idBad = this.typed?.problem === 'used' || this.typed?.problem === 'shape';
    const number = method.number ?? '';
    const steps = stepsOf(
      method.method,
      method.accountType,
      amountText(this.session.amount),
      (lead) => html`${lead} <b class="hl">${number}</b>${this.copyButton(number, number)}`,
      this.words,
    );
    return html`<h1 class="vh">${this.words.of('title')}</h1>
      ${this.walletHead(method)}
      ${this.note(this.words.of('noteLead'), this.words.of('note'), 'note')}
      ${method.note ? this.note(this.words.of('shopNoteLead'), method.note, 'shopnote') : ''}
      <form
        id="payform"
        class="ccard w-${method.method}"
        method="post"
        action="/${this.data.ref}/transaction"
      >
        ${this.hiddenFields(method)}
        <label class="ctitle" for="trx">${this.words.of('enterTrx')}</label>
        <input
          id="trx"
          class="inp ${idBad ? 'bad' : ''}"
          name="transactionId"
          value="${typedId}"
          placeholder="${this.words.of('enterTrx')}"
          maxlength="64"
          autocomplete="off"
          autocapitalize="characters"
          spellcheck="false"
          required
        />
        ${idBad ? html`<div class="ierr">${problem}</div>` : ''}
        <input
          class="inp two ${this.typed?.problem === 'sender' ? 'bad' : ''}"
          name="senderNumber"
          value="${typedSender}"
          placeholder="${this.words.of('senderPh')}"
          aria-label="${this.words.of('senderPh')}"
          maxlength="30"
          inputmode="tel"
          autocomplete="off"
        />
        ${this.typed?.problem === 'sender' ? html`<div class="ierr">${problem}</div>` : ''}
        <div class="ihead"><span>${this.words.of('instructions')}</span>${this.countdown()}</div>
        <ul class="ilist">
          ${steps.map((step) => html`<li><span>${step}</span></li>`)}
        </ul>
      </form>
      ${this.legal()}`;
  }

  private bankPanel(method: ShopperPaymentMethod): SafeHtml {
    const { bank } = method;
    const row = (label: string, value: string | null | undefined, copy = false): SafeHtml | null =>
      value
        ? html`<li>
            <span
              >${label}:
              <b class="hl">${value}</b>${copy ? this.copyButton(value, value) : ''}</span
            >
          </li>`
        : null;
    const amount = html`<b class="hl">${amountText(this.session.amount)}</b>`;
    const [before, after] = this.words.of('bankStep1').split('{a}');
    return html`<h1 class="vh">${this.words.of('title')}</h1>
      ${this.walletHead(method)}
      ${method.note ? this.note(this.words.of('shopNoteLead'), method.note, 'shopnote') : ''}
      <form id="payform" class="ccard w-bank" method="post" action="/${this.data.ref}/transaction">
        ${this.hiddenFields(method)}
        <label class="ctitle" for="trx">${this.words.of('enterRef')}</label>
        <input
          id="trx"
          class="inp ${this.typed?.problem ? 'bad' : ''}"
          name="transactionId"
          value="${this.typed?.transactionId ?? ''}"
          placeholder="${this.words.of('enterRef')}"
          maxlength="64"
          autocomplete="off"
          spellcheck="false"
          required
        />
        ${this.typed?.problem ? html`<div class="ierr">${this.problemWord(method)}</div>` : ''}
        <div class="ihead"><span>${this.words.of('instructions')}</span>${this.countdown()}</div>
        <ul class="ilist">
          <li><span>${before}${amount}${after}</span></li>
          ${row(this.words.of('bankName'), bank?.bankName)}
          ${row(this.words.of('acctName'), method.accountName)}
          ${row(this.words.of('acctNo'), bank?.accountNumber, true)}
          ${row(this.words.of('branch'), bank?.branch)}
          ${row(this.words.of('routing'), bank?.routingNumber, true)}
          ${row(this.words.of('swift'), bank?.swiftCode, true)}
          ${bank?.instructions ? html`<li><span>${bank.instructions}</span></li>` : ''}
          <li><span>${this.words.of('bankStep2')}</span></li>
        </ul>
      </form>
      ${this.legal()}`;
  }

  /** PAY-07: the wallet's screen again, with the ID filled in and how many corrections are left. */
  private changePanel(): SafeHtml {
    const { submitted, idChangesLeft } = this.session;
    const method = this.session.methods.find((row) => row.method === submitted?.method);
    const problem = this.typed?.problem ?? null;
    const word =
      problem === 'used'
        ? this.words.of('dupErr')
        : problem === 'sender'
          ? this.words.of('badSender')
          : problem === 'shape'
            ? this.words.of('badShape')
            : null;
    const colour = submitted?.method ?? PaymentMethod.Bkash;
    return html`<h1 class="vh">${this.words.of('title')}</h1>
      ${method ? this.walletHead(method) : ''}
      <form id="payform" class="ccard w-${colour}" method="post" action="/${this.data.ref}/change">
        <input type="hidden" name="lang" value="${this.ask.language}" />
        <label class="ctitle" for="trx">${this.words.of('fixTrx')}</label>
        <input
          id="trx"
          class="inp val ${problem === 'used' || problem === 'shape' ? 'bad' : ''}"
          name="transactionId"
          value="${this.typed?.transactionId ?? submitted?.transactionId ?? ''}"
          maxlength="64"
          autocomplete="off"
          spellcheck="false"
          required
        />
        <input
          class="inp two"
          name="senderNumber"
          value="${this.typed?.senderNumber ?? submitted?.senderNumber ?? ''}"
          placeholder="${this.words.of('senderPh')}"
          aria-label="${this.words.of('senderPh')}"
          maxlength="30"
          inputmode="tel"
          autocomplete="off"
        />
        ${word === null ? '' : html`<div class="ierr">${word}</div>`}
        <div class="ileft">${this.words.of('changesLeft', { n: idChangesLeft })}</div>
      </form>
      ${this.legal()}`;
  }

  private details(rows: readonly (readonly [string, string])[]): SafeHtml {
    return html`<div class="det">
      ${rows.map(
        ([label, value]) =>
          html`<div class="kv">
            <span class="k">${label}</span><span class="v">${value}</span>
          </div>`,
      )}
    </div>`;
  }

  private typedRows(): (readonly [string, string])[] {
    const { submitted, method, amount } = this.session;
    const paidBy = submitted?.method ?? method;
    const account = this.session.methods.find((row) => row.method === paidBy);
    const rows: (readonly [string, string])[] = [
      [this.words.of('amount'), `${amountText(amount)} ৳`],
    ];
    if (paidBy !== null) {
      const name = walletName(paidBy, this.words);
      rows.push([
        this.words.of('method'),
        paidBy === PaymentMethod.Bank || !account
          ? name
          : `${name} · ${verbOf(account.accountType)}`,
      ]);
    }
    if (submitted) rows.push([this.words.of('trx'), submitted.transactionId]);
    return rows;
  }

  private card(
    picture: SafeHtml,
    title: string,
    text: string | null,
    extra: HtmlPart = null,
    bare = false,
  ): SafeHtml {
    return html`<div class="scard">
        ${picture}
        <h1>${title}</h1>
        ${text ? html`<p>${text}</p>` : ''} ${extra}
      </div>
      ${this.legal(bare)}`;
  }

  private bigIcon(name: IconName, tone: string): SafeHtml {
    return html`<span class="ic ${tone}">${icon(name, 'i40')}</span>`;
  }

  private tick(): SafeHtml {
    return html`<span class="tick"
      ><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 6 9 17l-5-5" /></svg
    ></span>`;
  }

  private ring(): SafeHtml {
    const typedAt = this.session.submitted?.submittedAt ?? this.now;
    const seconds = Math.max(Math.floor((this.now.getTime() - typedAt.getTime()) / 1000), 0);
    return html`<div class="ring" data-typed="${typedAt.toISOString()}">
      <svg viewBox="0 0 72 72" aria-hidden="true">
        <circle class="bg" cx="36" cy="36" r="32" />
        <circle
          class="fg"
          cx="36"
          cy="36"
          r="32"
          stroke-dashoffset="${Math.round((201 * Math.min(seconds, 30)) / 30)}"
        />
      </svg>
      <span class="t">${seconds}s</span>
    </div>`;
  }

  private fixLink(): SafeHtml | null {
    return this.session.idChangesLeft > 0
      ? html`<a class="fixid" href="${this.address({ change: '1' })}"
          >${this.words.of('wrongTrxLink')}</a
        >`
      : null;
  }

  private rejectedText(): string {
    const { rejected } = this.session;
    const said =
      rejected?.reason === PaymentRejectReason.NoPaymentFound
        ? this.words.of('rejectNoPay')
        : rejected?.reason === PaymentRejectReason.TransactionIdUsed
          ? this.words.of('rejectUsed')
          : rejected?.note
            ? this.words.of('rejectedNote', { r: rejected.note })
            : '';
    const next =
      this.session.source === PaymentSessionSource.Checkout
        ? this.words.of('rejectedCancelled')
        : this.words.of('rejectedLink');
    return `${said} ${next}`.trim();
  }

  private content(): HtmlPart {
    const words = this.words;
    const chosen = chosenMethodOf(this.data, this.ask);
    const waiting = html`${this.details(this.typedRows())}${this.fixLink()}`;
    switch (this.screen) {
      case 'pick':
        return this.picker();
      case 'no-methods':
        return this.card(this.bigIcon('lock', 'grey'), words.of('noMethodsT'), null, this.help());
      case 'handing':
        return this.handing(chosen);
      case 'wallet':
        return chosen ? this.walletPanel(chosen) : null;
      case 'bank':
        return chosen ? this.bankPanel(chosen) : null;
      case 'change':
        return this.changePanel();
      case 'checking':
        return this.card(
          this.ring(),
          words.of('checkingT'),
          words.of('checkingP'),
          this.details(this.typedRows()),
        );
      case 'late':
        return this.card(
          this.bigIcon('clock', 'sky'),
          words.of('lateT'),
          words.of('lateP'),
          waiting,
        );
      case 'manual':
        return this.card(
          this.bigIcon('user', 'sky'),
          words.of('manualT'),
          words.of('manualP'),
          waiting,
        );
      case 'verified':
        return this.card(
          this.tick(),
          words.of('verifiedT'),
          words.of('verifiedP', { s: 5 }),
          this.details(this.paidRows()),
        );
      case 'verified-done':
        return this.card(
          this.tick(),
          words.of('verifiedT'),
          words.of('verifiedDoneP'),
          this.details(this.paidRows()),
        );
      case 'paid':
        return this.card(
          this.bigIcon('check', 'green'),
          words.of('paidT'),
          null,
          this.details(this.paidRows()),
        );
      case 'review':
        return this.card(
          this.bigIcon('search', 'yellow'),
          words.of('reviewT'),
          words.of('reviewP'),
          waiting,
        );
      case 'review-sender':
        return this.card(
          this.bigIcon('search', 'yellow'),
          words.of('reviewSenderT'),
          words.of('reviewSenderP'),
          waiting,
        );
      case 'review-other':
        return this.card(
          this.bigIcon('search', 'sky'),
          words.of('reviewOtherT'),
          words.of('reviewOtherP'),
          waiting,
        );
      case 'rejected':
        return this.card(
          this.bigIcon('x', 'red'),
          words.of('rejectedT'),
          this.rejectedText(),
          html`${this.details(this.typedRows())}${this.help()}`,
        );
      case 'expired':
        return this.card(
          this.bigIcon('clock', 'grey'),
          words.of('expiredT'),
          words.of('expiredP'),
          this.help(),
        );
      case 'cancelled':
        return this.card(
          this.bigIcon('x', 'grey'),
          words.of('cancelledT'),
          words.of('cancelledP'),
          this.help(),
        );
    }
  }

  private paidRows(): (readonly [string, string])[] {
    const when = this.session.submitted?.submittedAt;
    return [
      ...this.typedRows(),
      ...(when ? [[this.words.of('time'), timeText(when)] as const] : []),
    ];
  }

  /** PAY-06: a wallet on automated goes on to its own checkout. Starting one isn't a read, so the page posts for it. */
  private handing(chosen: ShopperPaymentMethod | null): SafeHtml {
    const w = chosen ? walletName(chosen.method, this.words) : '';
    return this.card(
      html`<div class="spin"></div>`,
      this.words.of('handT', { w }),
      this.words.of('handP'),
      chosen
        ? html`<form method="post" action="/${this.data.ref}/checkout" data-auto="1">
            ${this.hiddenFields(chosen)}
            <noscript
              ><button class="gwbtn line" type="submit">
                ${this.words.of('handGo')}
              </button></noscript
            >
          </form>`
        : null,
    );
  }

  private fixedButton(): HtmlPart {
    const words = this.words;
    const back = (status: string, tone: string): SafeHtml | null => {
      const address = returnAddressOf(this.data, status);
      return address === null
        ? null
        : html`<div class="fixedbar">
            <a class="vbtn ${tone}" href="${address}">${words.of('backShop')}</a>
          </div>`;
    };
    switch (this.screen) {
      case 'wallet':
      case 'bank':
        return html`<div class="fixedbar">
          <button
            class="vbtn w-${chosenMethodOf(this.data, this.ask)?.method ?? ''}"
            type="submit"
            form="payform"
          >
            ${words.of('verify')}
          </button>
        </div>`;
      case 'change':
        return html`<div class="fixedbar">
          <button
            class="vbtn w-${this.session.submitted?.method ?? PaymentMethod.Bkash}"
            type="submit"
            form="payform"
          >
            ${words.of('wrongTrx')}
          </button>
        </div>`;
      case 'checking':
        return this.session.idChangesLeft > 0
          ? html`<div class="fixedbar">
              <a class="vbtn b-grey" href="${this.address({ change: '1' })}"
                >${words.of('wrongTrx')}</a
              >
            </div>`
          : null;
      case 'verified':
        return back('verified', 'b-green');
      case 'paid':
        return back('verified', 'b-blue');
      case 'late':
      case 'manual':
        return back('checking', 'b-blue');
      case 'review':
      case 'review-sender':
      case 'review-other':
        return back('review', 'b-blue');
      case 'rejected':
        return back('failed', 'b-blue');
      case 'expired':
        return back('expired', 'b-blue');
      case 'cancelled':
        return back('cancelled', 'b-blue');
      case 'pick':
      case 'no-methods':
      case 'handing':
      case 'verified-done':
        return null;
    }
  }

  private bar(): SafeHtml {
    switch (this.screen) {
      case 'handing':
      case 'verified-done':
        return html`<div class="topgap"></div>`;
      case 'wallet':
      case 'bank':
        return this.topbar(this.address({ pick: '1' }), closeAddressOf(this.data));
      case 'pick':
      case 'no-methods':
        return this.topbar(null, closeAddressOf(this.data));
      case 'change':
        return this.topbar(this.address(), null);
      case 'verified':
      case 'paid':
        return this.topbar(null, returnAddressOf(this.data, 'verified'));
      case 'checking':
      case 'late':
      case 'manual':
        return this.topbar(null, returnAddressOf(this.data, 'checking'));
      case 'review':
      case 'review-sender':
      case 'review-other':
        return this.topbar(null, returnAddressOf(this.data, 'review'));
      case 'rejected':
        return this.topbar(null, returnAddressOf(this.data, 'failed'));
      case 'expired':
        return this.topbar(null, returnAddressOf(this.data, 'expired'));
      case 'cancelled':
        return this.topbar(null, returnAddressOf(this.data, 'cancelled'));
    }
  }

  private sheet(id: string, title: string, body: HtmlPart, open = false): SafeHtml {
    return html`<div id="${id}" class="scrim ${open ? 'open' : ''}">
      <a class="scrim-close" href="#" aria-label="${this.words.of('close')}"></a>
      <div class="sheet" role="dialog" aria-modal="true" aria-label="${title}">
        <div class="sh">
          <h2>${title}</h2>
          <a href="#" aria-label="${this.words.of('close')}">${icon('x', 'i22')}</a>
        </div>
        ${body}
      </div>
    </div>`;
  }

  private detailsSheet(): SafeHtml {
    const { orderNumber, items, amount } = this.session;
    return this.sheet(
      'details',
      this.words.of('detailsT'),
      html`<div class="sb">
        ${this.details([
          [this.words.of('orderNo'), orderNumber],
          ...items.map(
            (item) =>
              [
                item.attributes.length === 0
                  ? item.name
                  : `${item.name} · ${item.attributes.join(', ')}`,
                `× ${item.quantity}`,
              ] as const,
          ),
          [this.words.of('toPay'), `${amountText(amount)} ৳`],
        ])}
      </div>`,
    );
  }

  /** TVR-02: asked for a PIN or code, not the shop ordered from, the wrong amount, or something else with a note. */
  private reportSheet(): SafeHtml {
    const typed = this.typedReport;
    const options: readonly (readonly [PaymentPageReportReason, string])[] = [
      [PaymentPageReportReason.WrongShop, this.words.of('reportWrongShop')],
      [PaymentPageReportReason.WrongAmount, this.words.of('reportWrongAmount')],
      [PaymentPageReportReason.AskedForPin, this.words.of('reportPin')],
      [PaymentPageReportReason.Other, this.words.of('reportOther')],
    ];
    return this.sheet(
      'report',
      this.words.of('reportTitle'),
      html`<form method="post" action="/${this.data.ref}/report">
        <input type="hidden" name="lang" value="${this.ask.language}" />
        <div class="sb choose">
          ${options.map(
            ([reason, label]) =>
              html`<input
                  class="radio"
                  type="radio"
                  id="r-${reason}"
                  name="reason"
                  value="${reason}"
                  ${typed?.reason === reason ? html`checked` : ''}
                  required
                /><label class="opt" for="r-${reason}">${label}</label>`,
          )}
          <div class="rnote">
            <input
              class="inp"
              name="note"
              value="${typed?.note ?? ''}"
              placeholder="${this.words.of('reportNote')}"
              aria-label="${this.words.of('reportNote')}"
              maxlength="500"
            />
            ${typed ? html`<p class="rerr">${this.words.of('reportNeedsNote')}</p>` : ''}
          </div>
        </div>
        <div class="sf">
          <button class="btn" type="submit">${this.words.of('sendReport')}</button>
        </div>
      </form>`,
      typed !== null,
    );
  }

  draw(): string {
    const fixed = this.fixedButton();
    const chosen = chosenMethodOf(this.data, this.ask);
    const verifiedReturn = returnAddressOf(this.data, 'verified');
    const walletClass = chosen ? `w-${chosen.method}` : '';
    return page(
      {
        title: `${this.data.shop.name} · ${this.words.of('title')}`,
        screen: this.screen,
        language: this.ask.language,
        assets: this.assets,
        bodyClass: walletClass,
        ref: this.data.ref,
        poll: WAITING_SCREENS.has(this.screen),
        ...(this.screen === 'verified' && verifiedReturn ? { returnTo: verifiedReturn } : {}),
        head: html`${
          this.screen === 'verified' && verifiedReturn
            ? html`<noscript
                ><meta http-equiv="refresh" content="5;url=${verifiedReturn}"
              /></noscript>`
            : ''
        }
        ${
          WAITING_SCREENS.has(this.screen)
            ? html`<noscript
                ><meta http-equiv="refresh" content="10;url=${this.address({ just: '1' })}"
              /></noscript>`
            : ''
        }`,
      },
      html`<main class="pp">
          <div class="root">
            <div class="card">
              ${this.bar()}
              <div class="content ${fixed ? 'has-fixed' : ''}">${this.content()}</div>
            </div>
          </div>
          ${fixed}
        </main>
        ${this.detailsSheet()} ${this.reportSheet()}
        ${
          this.ask.reported
            ? html`<div class="toast" role="status">
                ${icon('check', 'i18')}${this.words.of('reportedT')}
              </div>`
            : ''
        }
        <div class="toast" id="copied" role="status" hidden></div>`,
    );
  }
}

export interface DrawOptions {
  typed?: TypedForm | null;
  typedReport?: TypedReport | null;
}

/** PAYMENT-PAGE-DESIGN §1, §2: a session's page, from its read and its address. Pure, so it can be drawn from fixtures. */
export function drawPage(
  data: PageData,
  ask: PageAsk,
  now: Date,
  assets: PageAssets,
  options: DrawOptions = {},
): string {
  return new PageDrawing(
    data,
    ask,
    now,
    assets,
    options.typed ?? null,
    options.typedReport ?? null,
  ).draw();
}

/** PAY-06: going on to a wallet's own checkout. A form's redirect to another site is refused by `form-action`, a refresh isn't. */
export function drawHandOver(
  address: string,
  method: PaymentMethod,
  language: PageLanguage,
  assets: PageAssets,
): string {
  const words = new PageWords(language);
  const w = walletName(method, words);
  return page(
    {
      title: words.of('title'),
      screen: 'handing',
      language,
      assets,
      head: html`<meta http-equiv="refresh" content="0;url=${address}" />`,
    },
    html`<main class="pp">
      <div class="root">
        <div class="card">
          <div class="topgap"></div>
          <div class="content">
            <div class="scard">
              <div class="spin"></div>
              <h1>${words.of('handT', { w })}</h1>
              <p>${words.of('handP')}</p>
              <a class="gwbtn line" href="${address}" rel="noreferrer">${words.of('handGo')}</a>
            </div>
          </div>
        </div>
      </div>
    </main>`,
  );
}

export type PageProblem = 'missing' | 'suspended' | 'busy' | 'wrong';

/** TVR-03, PAY-03, RTE-06: what the page says when there is no session to draw. */
export function drawProblem(
  problem: PageProblem,
  language: PageLanguage,
  assets: PageAssets,
): string {
  const words = new PageWords(language);
  const [name, title, text] = (
    {
      missing: ['search', words.of('missingT'), words.of('missingP')],
      suspended: ['lock', words.of('suspendedT'), null],
      busy: ['clock', words.of('busyT'), words.of('busyP')],
      wrong: ['clock', words.of('wrongT'), words.of('wrongP')],
    } as const
  )[problem];
  return page(
    { title: words.of('title'), screen: problem, language, assets },
    html`<main class="pp">
      <div class="root">
        <div class="card">
          <div class="topgap"></div>
          <div class="content">
            <div class="scard">
              <span class="ic grey">${icon(name, 'i40')}</span>
              <h1>${title}</h1>
              ${text ? html`<p>${text}</p>` : ''}
            </div>
            <p class="legal">🔒 Secured by Lytro · ${words.of('secured')}</p>
          </div>
        </div>
      </div>
    </main>`,
  );
}
