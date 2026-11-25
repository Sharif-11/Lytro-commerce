import './developers.css';
import { Fragment, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from '@tanstack/react-router';
import {
  ApiKeyPurpose,
  LIMIT_WHEN_UNSET,
  PAYG_API_CAP_DEFAULT,
  PAYG_API_CAP_MAX,
  Permission,
  TenantState,
  UsageMetric,
} from '@lytronix/validators';
import {
  DOC_ADDRESS_EXAMPLES,
  DOC_BASE,
  DOC_COMMON_ERRORS,
  DOC_ERROR_CODES,
  DOC_FIRST_CALL,
  DOC_GROUP_INTROS,
  DOC_GROUPS,
  DOC_MINUTE_LIMITS,
  DOC_PARTS,
  DOC_REQUEST_HEADERS,
  DOC_RESPONSE_HEADERS,
  DOC_ROUTES,
  docCurl,
  docEnvelope,
  docFailed,
  docFetch,
  docHighlight,
  docInvalid,
  docResponse,
  type DocHeader,
  type DocLanguage,
  type DocRoute,
  type Pair,
  type RouteError,
} from '@lytronix/validators/developer-api';
import { useApiCharges, useApiKeys } from '@/api/api-keys';
import { usePayAsYouGoPlan, usePlans } from '@/api/billing';
import { useUsage } from '@/api/usage';
import { Icon } from '@/components/icon';
import { Banner } from '@/components/ui/banner';
import { Button } from '@/components/ui/button';
import { buttonClass } from '@/components/ui/classes';
import { Toast } from '@/components/ui/toast';
import { useToast } from '@/hooks/use-toast';
import { appConfig } from '@/lib/app-config';
import { allows } from '@/shell/hubs';
import { useShell } from '@/shell/shell-context';
import { ShellPage } from '@/shell/shell-page';
import type { CreatedApiKey } from '@/types/api-key';
import { CreatedKeySheet, NewKeySheet } from '../api-key-sheets';
import { WORDS, type WordKey } from './words';

type Tab = 'curl' | 'js';

/** The words in the dashboard's language, a {placeholder} filled. */
function useWords() {
  const { i18n } = useTranslation();
  const lang: DocLanguage = i18n.language === 'en' ? 'en' : 'bn';
  const pick = (pair: Pair): string => (lang === 'bn' ? pair[0] : pair[1]);
  const w = (key: WordKey, values: Record<string, string | number> = {}): string =>
    pick(WORDS[key]).replace(/\{(\w+)\}/g, (all, name: string) =>
      name in values ? String(values[name]) : all,
    );
  return { lang, pick, w };
}

/** A computer's width: the parts' list at the side and every route open (the sketch's desktop frame). */
function useWide(): boolean {
  const query = '(min-width: 1024px)';
  const [wide, setWide] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const list = window.matchMedia(query);
    const change = (): void => {
      setWide(list.matches);
    };
    list.addEventListener('change', change);
    return () => {
      list.removeEventListener('change', change);
    };
  }, []);
  return wide;
}

const statusClass = (status: number): string => (status < 300 ? 'ok' : status < 500 ? 'e4' : 'e5');
const number = (value: number): string => value.toLocaleString('en-US');
const taka = (value: string | number): string =>
  Number(value).toLocaleString('en-US', { maximumFractionDigits: 2 });

function Highlighted({ text, kind }: { text: string; kind: 'json' | 'code' }): React.JSX.Element {
  return (
    <>
      {docHighlight(text, kind).map((token, at) =>
        token.kind ? (
          <span key={at} className={token.kind}>
            {token.text}
          </span>
        ) : (
          <Fragment key={at}>{token.text}</Fragment>
        ),
      )}
    </>
  );
}

/** Copy, then Copied with a check for 1.6 s, and the toast (`dev-copied`). */
function CopyButton({ text, onCopied }: { text: string; onCopied: () => void }): React.JSX.Element {
  const { t } = useTranslation('shell');
  const [done, setDone] = useState(false);
  useEffect(() => {
    if (!done) return;
    const timer = setTimeout(() => {
      setDone(false);
    }, 1600);
    return () => {
      clearTimeout(timer);
    };
  }, [done]);
  return (
    <button
      type="button"
      className={done ? 'dv-copy done' : 'dv-copy'}
      onClick={() => {
        void navigator.clipboard.writeText(text).catch(() => undefined);
        setDone(true);
        onCopied();
      }}
    >
      <Icon name={done ? 'check' : 'copy'} size={15} />
      <span>{done ? t('copied') : t('copy')}</span>
    </button>
  );
}

interface Shared {
  tab: Tab;
  setTab: (tab: Tab) => void;
  copied: () => void;
  jump: (id: string) => void;
}

function RequestBox({ r, shared }: { r: DocRoute; shared: Shared }): React.JSX.Element {
  const { lang } = useWords();
  const text = shared.tab === 'curl' ? docCurl(r, lang) : docFetch(r, lang);
  return (
    <div className="dv-code">
      <div className="dv-ch">
        <div className="dv-tabs" role="tablist">
          {(
            [
              ['curl', 'curl'],
              ['js', 'JavaScript'],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={shared.tab === key}
              className={shared.tab === key ? 'on' : undefined}
              onClick={() => {
                shared.setTab(key);
              }}
            >
              {label}
            </button>
          ))}
        </div>
        <CopyButton text={text} onCopied={shared.copied} />
      </div>
      <pre className="on" tabIndex={0}>
        <Highlighted text={text} kind="code" />
      </pre>
    </div>
  );
}

function AnswerBox({
  status,
  label,
  text,
  csv = false,
  onCopied,
}: {
  status: number;
  label: string;
  text: string;
  csv?: boolean;
  onCopied: () => void;
}): React.JSX.Element {
  return (
    <div className="dv-code res">
      <div className="dv-ch">
        <span className="dv-rl">
          <span className={`dv-s ${statusClass(status)}`}>{status}</span>
          {label}
        </span>
        <CopyButton text={text} onCopied={onCopied} />
      </div>
      <pre className="on" tabIndex={0}>
        {csv ? text : <Highlighted text={text} kind="json" />}
      </pre>
    </div>
  );
}

function ErrorRow({ row }: { row: RouteError }): React.JSX.Element {
  const { lang } = useWords();
  return (
    <div className="dv-err">
      <span className={`dv-s ${statusClass(row[0])}`}>{row[0]}</span>
      <code>{row[1]}</code>
      <span className="dv-em">{lang === 'bn' ? row[3] : row[4]}</span>
    </div>
  );
}

function Method({ m }: { m: DocRoute['m'] }): React.JSX.Element {
  return <span className={`dv-m ${m.toLowerCase()}`}>{m}</span>;
}

function RouteItem({
  r,
  open,
  shared,
}: {
  r: DocRoute;
  open: boolean;
  shared: Shared;
}): React.JSX.Element {
  const { lang, pick, w } = useWords();
  return (
    <details className="dv-route" id={`dv-${r.id}`} open={open}>
      <summary>
        <span className="dv-line">
          <Method m={r.m} />
          <code className="dv-path">/v1{r.p}</code>
          {r.sell ? <span className="dv-sell">{w('worksPast')}</span> : null}
          <Icon name="down" size={18} />
        </span>
        <span className="dv-what">{pick(r.what)}</span>
      </summary>
      <div className="dv-rb">
        {r.params.length > 0 ? (
          <>
            <div className="dv-sub">{w('parameters')}</div>
            <div className="dv-ps">
              {r.params.map((param) => (
                <div key={`${param.at}-${param.n}`} className="dv-p">
                  <div className="dv-pn">
                    <code>{param.n}</code>
                    <span className="dv-in">{param.at}</span>
                    {param.ty ? <span className="dv-ty">{param.ty}</span> : null}
                    <span className={param.req ? 'dv-req on' : 'dv-req'}>
                      {param.req ? w('required') : w('optional')}
                    </span>
                  </div>
                  <div className="dv-pd">{pick(param.d)}</div>
                </div>
              ))}
            </div>
          </>
        ) : (
          <p className="dv-none">{w('noParameters')}</p>
        )}
        <div className="dv-sub" id={`dv-${r.id}-req`}>
          {w('request')}
        </div>
        <RequestBox r={r} shared={shared} />
        <AnswerBox
          status={r.st ?? 200}
          label={w('response') + (r.csv ? ' · text/csv' : '')}
          text={docResponse(r, lang)}
          csv={r.csv}
          onCopied={shared.copied}
        />
        {r.note ? (
          <p className="dv-note">
            <Icon name="info" size={16} />
            <span>{pick(r.note)}</span>
          </p>
        ) : null}
        <div className="dv-sub">{w('errors')}</div>
        {(r.errs ?? []).map((row) => (
          <ErrorRow key={`${row[1]}-${row[2]}`} row={row} />
        ))}
        <p className="dv-also">
          {r.nokey ? (
            w('feedErrors')
          ) : (
            <>
              {w('alsoEvery')}{' '}
              <button
                type="button"
                className="dv-lnk"
                onClick={() => {
                  shared.jump('errors');
                }}
              >
                {w('errors')}
              </button>
            </>
          )}
        </p>
      </div>
    </details>
  );
}

function Nav({ at, jump }: { at: string; jump: (id: string) => void }): React.JSX.Element {
  const { pick, w } = useWords();
  return (
    <nav className="dv-nav" aria-label={w('docsParts')}>
      {DOC_PARTS.map(([id, title]) => (
        <button
          key={id}
          type="button"
          className={at === id ? 'on' : undefined}
          onClick={() => {
            jump(id);
          }}
        >
          {pick(title)}
        </button>
      ))}
      {DOC_GROUPS.map((group) => (
        <Fragment key={group.id}>
          <div className="dv-ng">{pick(group.t)}</div>
          {DOC_ROUTES.filter((r) => r.g === group.id).map((r) => (
            <button
              key={r.id}
              type="button"
              className={at === r.id ? 'dv-nr on' : 'dv-nr'}
              onClick={() => {
                jump(r.id);
              }}
            >
              <Method m={r.m} />
              <span>{r.p}</span>
            </button>
          ))}
        </Fragment>
      ))}
    </nav>
  );
}

function HeaderRow({ header }: { header: DocHeader }): React.JSX.Element {
  const { pick } = useWords();
  return (
    <div className="dv-h">
      <div>
        <code>{header.name}</code>
        {header.eg ? <span className="dv-ty">{header.eg}</span> : null}
      </div>
      <p>{pick(header.what)}</p>
    </div>
  );
}

/**
 * Developer API (TENANT-DASHBOARD-DESIGN §7.48, the prototype's `dev-docs` and its states): every public /v1 route with a
 * sample request and answer, from the one definition lytro.app/developers also reads, and this shop's own keys and
 * limits around it. With pay-as-you-go fair use on, a pay-as-you-go shop sees its month's API charge and limit (the
 * 2026-11-25 amendment, `dev-limits-payg`, `dev-used-up-payg`).
 */
export function DevelopersView(): React.JSX.Element {
  const { t } = useTranslation('menu');
  const { lang, pick, w } = useWords();
  const { tenant, viewer } = useShell();
  const wide = useWide();
  const toast = useToast();
  const keys = useApiKeys();
  const usage = useUsage({ enabled: allows(viewer, [Permission.PaymentsRead]) });
  const fairUse = tenant.fairUse?.on === true;
  const payg = fairUse && tenant.state === TenantState.PayAsYouGo;
  const charges = useApiCharges({ enabled: fairUse });
  const plans = usePlans();
  const paygPlan = usePayAsYouGoPlan();
  const [tab, setTab] = useState<Tab>('curl');
  const [at, setAt] = useState('start');
  const [tocOpen, setTocOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [created, setCreated] = useState<CreatedApiKey | null>(null);
  const readOnly = tenant.state === TenantState.ReadOnly;

  const ownKeys = (keys.data ?? []).filter(
    (key) => key.purpose !== ApiKeyPurpose.Storefront && key.revokedAt === null,
  ).length;
  const requests = usage.data?.metrics.find((each) => each.metric === UsageMetric.Requests);
  const summary = charges.data;
  const usedUp =
    !payg &&
    requests !== undefined &&
    (requests.level === 'stopped' || (requests.limit !== null && requests.used >= requests.limit));
  const capped = payg && summary?.stopped === true;
  const free = summary?.free ?? 0;
  const rate = summary ? taka(summary.rate) : '';

  const jump = (id: string): void => {
    const element = document.getElementById(`dv-${id}`);
    if (!element) return;
    if (element instanceof HTMLDetailsElement) element.open = true;
    setTocOpen(false);
    setAt(id);
    element.scrollIntoView({ block: 'start' });
  };
  const copied = (): void => {
    toast.show(t('copied', { ns: 'shell' }));
  };
  const shared: Shared = { tab, setTab, copied, jump };
  const slug = tenant.slug;

  // The plans' requests a cycle, live (Trial's from LIMIT_WHEN_UNSET): every plan has an API, so no plan lacks a row.
  const rows: { name: string; figure: string; own: boolean }[] = [
    {
      name: pick(['ট্রায়াল', 'Trial']),
      figure: number(LIMIT_WHEN_UNSET.requests_monthly ?? 0),
      own: tenant.state === TenantState.Trial,
    },
    {
      name: pick(['পে-অ্যাজ-ইউ-গো', 'Pay-as-you-go']),
      figure: fairUse
        ? w('paygRow', { free: number(free), rate })
        : number(paygPlan.data?.limits.requests_monthly ?? 0),
      own: tenant.state === TenantState.PayAsYouGo,
    },
    ...(plans.data ?? []).map((plan) => ({
      name: plan.name,
      figure: number(plan.limits.requests_monthly ?? 0),
      own: tenant.planName === plan.name && tenant.state !== TenantState.PayAsYouGo,
    })),
  ];

  const newKey = readOnly ? null : (
    <Button
      size="sm"
      onClick={() => {
        setAdding(true);
      }}
    >
      <Icon name="plus" />
      {t('akNew')}
    </Button>
  );

  const start = (
    <section className="dv-sec" id="dv-start">
      <h2>{w('gettingStarted')}</h2>
      <p className="dv-p1">{w('startLead')}</p>
      <ol className="dv-steps">
        <li>
          <b>{w('step1')}</b>
          <p>{w('step1Body')}</p>
          {keys.data === undefined ? null : ownKeys === 0 ? (
            <>
              <Banner tone="warn">{w('noKeyYet')}</Banner>
              {newKey ? <div>{newKey}</div> : null}
            </>
          ) : (
            <div className="dv-have">
              <Icon name="check" size={18} />
              <span>{w('liveKeys', { count: ownKeys })}</span>
              <Link
                to="/$shop/settings/api-keys"
                params={{ shop: slug }}
                className={`btn ${buttonClass('outline', 'xs')}`}
              >
                {w('seeApiKeys')}
              </Link>
            </div>
          )}
        </li>
        <li>
          <b>{w('step2')}</b>
          <p>{w('step2Body')}</p>
          <div className="dv-eg">
            {DOC_ADDRESS_EXAMPLES.map(([kind, address, why]) => (
              <div key={address} className={kind}>
                <b>{kind === 'ok' ? '✓' : '✗'}</b>
                <code>{address}</code>
                {why ? <span>{pick(why)}</span> : null}
              </div>
            ))}
          </div>
        </li>
        <li>
          <b>{w('step3')}</b>
          <p>{w('step3Body')}</p>
          <RequestBox r={DOC_FIRST_CALL} shared={shared} />
          <AnswerBox
            status={200}
            label={w('response')}
            text={docResponse(DOC_FIRST_CALL, lang)}
            onCopied={copied}
          />
        </li>
      </ol>
      <div className="dv-callout">
        <Icon name="shield" size={20} />
        <div>
          <b>{w('publicKey')}</b>
          <p>{w('publicKeyBody')}</p>
        </div>
      </div>
    </section>
  );

  const auth = (
    <section className="dv-sec" id="dv-auth">
      <h2>{w('authTitle')}</h2>
      <p className="dv-p1">{w('authLead')}</p>
      <h3>{w('requestHeaders')}</h3>
      <div className="dv-hs">
        {DOC_REQUEST_HEADERS.map((header) => (
          <HeaderRow key={header.name} header={header} />
        ))}
      </div>
      <h3>{w('responseHeaders')}</h3>
      <div className="dv-hs">
        {DOC_RESPONSE_HEADERS.map((header) => (
          <HeaderRow key={header.name} header={header} />
        ))}
      </div>
      <h3>{w('envelope')}</h3>
      <p className="dv-p1">{w('envelopeBody')}</p>
      <AnswerBox
        status={200}
        label={w('response')}
        text={JSON.stringify(docEnvelope(DOC_FIRST_CALL, lang), null, 2)}
        onCopied={copied}
      />
    </section>
  );

  const cap = Number(summary?.cap ?? PAYG_API_CAP_DEFAULT);
  const charged = Number(summary?.charged ?? 0);
  const limitsCard = payg ? (
    <div className="card dv-use rounded-card border border-line bg-surface p-4">
      <div className="kv">
        <span className="k">{w('paygCharge')}</span>
        <span className="v num">
          ৳{taka(charged)} / ৳{taka(cap)}
        </span>
      </div>
      <div className="bar">
        <i
          style={{
            width: `${String(cap > 0 ? Math.min(100, (charged / cap) * 100) : capped ? 100 : 0)}%`,
            ...(capped ? { background: 'var(--color-danger)' } : {}),
          }}
        />
      </div>
      <p className="dv-cap">
        {w('paygRequests', { requests: number(summary?.requests ?? 0), free: number(free), rate })}
      </p>
      <div className="actions">
        <Link
          to="/$shop/settings/api-keys"
          params={{ shop: slug }}
          className={buttonClass('outline', 'xs')}
        >
          {w('paygLink')}
        </Link>
      </div>
    </div>
  ) : requests ? (
    <div className="card dv-use rounded-card border border-line bg-surface p-4">
      <div className="kv">
        <span className="k">
          {tenant.planName ?? pick(['ট্রায়াল', 'Trial'])} · {w('thisCycle')}
        </span>
        <span className="v num">
          {number(requests.used)}
          {requests.limit === null ? '' : ` / ${number(requests.limit)}`}
        </span>
      </div>
      <div className="bar">
        <i
          style={{
            width: `${String(requests.limit ? Math.min(100, (requests.used / requests.limit) * 100) : 0)}%`,
            ...(usedUp ? { background: 'var(--color-danger)' } : {}),
          }}
        />
      </div>
      <div className="actions">
        <Link to="/$shop/usage" params={{ shop: slug }} className={buttonClass('outline', 'xs')}>
          {w('seeUsage')}
        </Link>
        {readOnly ? null : (
          <Link to="/$shop/addons" params={{ shop: slug }} className={buttonClass('outline', 'xs')}>
            {w('buyPack')}
          </Link>
        )}
      </div>
    </div>
  ) : null;

  const address = `${slug}.${appConfig.platformDomain}`;
  const limits = (
    <section className="dv-sec" id="dv-limits">
      <h2>{w('limits')}</h2>
      <p className="dv-p1">{w('limitsLead')}</p>
      <div className="dv-lim">
        {DOC_MINUTE_LIMITS.map(([figure, what]) => (
          <div key={figure + what[1]} className="dv-lc">
            <b className="num">{figure}</b>
            <span>{pick(what)}</span>
          </div>
        ))}
      </div>
      <h3>{w('perCycle')}</h3>
      {limitsCard}
      <div className="dv-plans">
        {rows.map((row) => (
          <div key={row.name} className={row.own ? 'dv-pl on' : 'dv-pl'}>
            <span>
              {row.name}
              {row.own ? (
                <>
                  {' '}
                  <span className="dv-st">{w('yourPlan')}</span>
                </>
              ) : null}
            </span>
            <b className="num">{row.figure}</b>
          </div>
        ))}
      </div>
      <ul className="dv-ul">
        {payg ? (
          <>
            <li>{w('paygCounted')}</li>
            <li>
              {w('paygLimit', {
                max: number(PAYG_API_CAP_MAX),
                start: taka(PAYG_API_CAP_DEFAULT),
              })}
            </li>
            <li>{w('paygStop')}</li>
            <li>{w('paygNoPacks')}</li>
          </>
        ) : (
          <>
            <li>{w('toldAt')}</li>
            <li>{w('pastIt')}</li>
            <li>{w('packRaises')}</li>
          </>
        )}
        <li>{w('notCounted', { address })}</li>
      </ul>
    </section>
  );

  const errors = (
    <section className="dv-sec" id="dv-errors">
      <h2>{w('errors')}</h2>
      <p className="dv-p1">{w('errorsLead')}</p>
      <AnswerBox
        status={401}
        label={w('response')}
        text={JSON.stringify(docFailed(lang), null, 2)}
        onCopied={copied}
      />
      <h3>details.fields</h3>
      <p className="dv-p1">{w('fieldsLead')}</p>
      <AnswerBox
        status={400}
        label={w('response')}
        text={JSON.stringify(docInvalid(lang), null, 2)}
        onCopied={copied}
      />
      <h3>errors.code</h3>
      <div className="dv-codes">
        {DOC_ERROR_CODES.map(([status, code, what]) => (
          <div key={code} className="dv-err">
            <span className={`dv-s ${statusClass(status)}`}>{status}</span>
            <code>{code}</code>
            <span className="dv-em">{pick(what)}</span>
          </div>
        ))}
      </div>
      <h3>{w('checkedOrder')}</h3>
      <p className="dv-p1">{w('checkedOrderBody')}</p>
      <div className="dv-codes">
        {DOC_COMMON_ERRORS.map((row) => (
          <ErrorRow key={row[2]} row={row} />
        ))}
      </div>
    </section>
  );

  const groups = DOC_GROUPS.map((group) => (
    <section key={group.id} className="dv-sec" id={`dv-g-${group.id}`}>
      <h2>{pick(group.t)}</h2>
      {DOC_GROUP_INTROS[group.id] ? (
        <p className="dv-p1">{pick(DOC_GROUP_INTROS[group.id] ?? ['', ''])}</p>
      ) : null}
      {DOC_ROUTES.filter((r) => r.g === group.id).map((r) => (
        <RouteItem key={r.id} r={r} open={wide || at === r.id} shared={shared} />
      ))}
    </section>
  ));
  const body = (
    <div className="dv-main">
      {start}
      {auth}
      {limits}
      {errors}
      {groups}
    </div>
  );

  return (
    <ShellPage>
      <p className="dv-lead">{w('lead')}</p>
      <div className="dv-base">
        <span>{w('baseUrl')}</span>
        <code>{DOC_BASE}</code>
        <span className="dv-ver">v1</span>
        <CopyButton text={DOC_BASE} onCopied={copied} />
      </div>
      {usedUp && requests.limit ? (
        <Banner
          tone="bad"
          action={
            readOnly ? undefined : (
              <Link to="/$shop/addons" params={{ shop: slug }} className="font-semibold underline">
                {w('buyPack')}
              </Link>
            )
          }
        >
          {w('usedUp', { limit: number(requests.limit) })}
        </Banner>
      ) : null}
      {capped ? (
        <Banner
          tone="bad"
          action={
            readOnly ? undefined : (
              <Link
                to="/$shop/settings/api-keys"
                params={{ shop: slug }}
                className="font-semibold underline"
              >
                {w('raiseLimit')}
              </Link>
            )
          }
        >
          {w('capped', { cap: taka(cap) })}
        </Banner>
      ) : null}
      {wide ? (
        <div className="dv">
          <aside className="dv-side">
            <Nav at={at} jump={jump} />
          </aside>
          {body}
        </div>
      ) : (
        <>
          <details
            className="dv-toc"
            open={tocOpen}
            onToggle={(event) => {
              setTocOpen(event.currentTarget.open);
            }}
          >
            <summary>
              <Icon name="list" size={18} />
              <span>{w('onThisPage')}</span>
              <small>{w('tocCount', { routes: DOC_ROUTES.length })}</small>
              <Icon name="down" size={18} />
            </summary>
            <Nav at={at} jump={jump} />
          </details>
          {body}
        </>
      )}
      <NewKeySheet
        open={adding}
        onClose={() => {
          setAdding(false);
        }}
        onCreated={(key) => {
          setAdding(false);
          setCreated(key);
        }}
      />
      <CreatedKeySheet
        created={created}
        onClose={() => {
          setCreated(null);
        }}
      />
      <Toast message={toast.message} />
    </ShellPage>
  );
}
