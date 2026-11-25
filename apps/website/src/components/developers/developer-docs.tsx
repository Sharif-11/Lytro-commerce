'use client';

import './developers.css';
import { Fragment, useEffect, useState, type ReactNode } from 'react';
import {
  DOC_ADDRESS_EXAMPLES,
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
import { buttonClass } from '@/components/ui/button';
import { WORDS, type WordKey } from './words';

type Tab = 'curl' | 'js';

/** A plan's requests a cycle, as the plans table shows it (read live by the page). */
export interface PlanRow {
  name: Pair;
  figure: string;
}

export interface DeveloperDocsProps {
  language: DocLanguage;
  plans: readonly PlanRow[];
  /** Pay-as-you-go's API charge while fair use is on: the free requests and the rate per 1,000; null with it off. */
  payg: { free: string; rate: string; max: string } | null;
  signUpUrl: string;
  signInUrl: string;
}

const statusClass = (status: number): string => (status < 300 ? 'ok' : status < 500 ? 'e4' : 'e5');

// The sketch's line icons, drawn inline (24-unit, round strokes).
function Svg({
  children,
  className,
  size = 18,
}: {
  children: ReactNode;
  className?: string;
  size?: number;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      aria-hidden="true"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  );
}
const Chevron = () => (
  <Svg className="dv-chev">
    <path d="m6 9 6 6 6-6" />
  </Svg>
);
const Check = ({ size = 16 }: { size?: number }) => (
  <Svg size={size}>
    <path d="M20 6 9 17l-5-5" />
  </Svg>
);
const CopyIcon = () => (
  <Svg size={15}>
    <rect x="9" y="9" width="13" height="13" rx="2" />
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
  </Svg>
);

/** Copy, then Copied with a check for 1.6 s. */
function CopyText({
  text,
  copy,
  copied,
  onCopied,
}: {
  text: string;
  copy: string;
  copied: string;
  onCopied: () => void;
}): React.JSX.Element {
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
      {done ? <Check size={15} /> : <CopyIcon />}
      <span>{done ? copied : copy}</span>
    </button>
  );
}

export function DeveloperDocs({
  language,
  plans,
  payg,
  signUpUrl,
  signInUrl,
}: DeveloperDocsProps): React.JSX.Element {
  const pick = (pair: Pair): string => (language === 'bn' ? pair[0] : pair[1]);
  const w = (key: WordKey, values: Record<string, string | number> = {}): string =>
    pick(WORDS[key]).replace(/\{(\w+)\}/g, (all, name: string) =>
      name in values ? String(values[name]) : all,
    );
  const [tab, setTab] = useState<Tab>('curl');
  const [wide, setWide] = useState(false);
  const [toast, setToast] = useState(false);
  const [at, setAt] = useState('start');

  useEffect(() => {
    const list = window.matchMedia('(min-width: 900px)');
    const change = (): void => {
      setWide(list.matches);
    };
    change();
    list.addEventListener('change', change);
    return () => {
      list.removeEventListener('change', change);
    };
  }, []);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => {
      setToast(false);
    }, 1600);
    return () => {
      clearTimeout(timer);
    };
  }, [toast]);

  const jump = (id: string): void => {
    const element = document.getElementById(`dv-${id}`);
    if (!element) return;
    if (element instanceof HTMLDetailsElement) element.open = true;
    const toc = document.querySelector<HTMLDetailsElement>('.dv-page .dv-toc');
    if (toc) toc.open = false;
    setAt(id);
    element.scrollIntoView({ block: 'start' });
  };

  const copyButton = (text: string) => (
    <CopyText
      text={text}
      copy={w('copy')}
      copied={w('copied')}
      onCopied={() => {
        setToast(true);
      }}
    />
  );

  const highlighted = (text: string, kind: 'json' | 'code') =>
    docHighlight(text, kind).map((token, index) =>
      token.kind ? (
        <span key={index} className={token.kind}>
          {token.text}
        </span>
      ) : (
        <Fragment key={index}>{token.text}</Fragment>
      ),
    );

  const request = (r: DocRoute) => {
    const text = tab === 'curl' ? docCurl(r, language) : docFetch(r, language);
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
                aria-selected={tab === key}
                className={tab === key ? 'on' : undefined}
                onClick={() => {
                  setTab(key);
                }}
              >
                {label}
              </button>
            ))}
          </div>
          {copyButton(text)}
        </div>
        <pre className="on" tabIndex={0}>
          {highlighted(text, 'code')}
        </pre>
      </div>
    );
  };

  const answer = (status: number, label: string, text: string, csv = false) => (
    <div className="dv-code res">
      <div className="dv-ch">
        <span className="dv-rl">
          <span className={`dv-s ${statusClass(status)}`}>{status}</span>
          {label}
        </span>
        {copyButton(text)}
      </div>
      <pre className="on" tabIndex={0}>
        {csv ? text : highlighted(text, 'json')}
      </pre>
    </div>
  );

  const errorRow = (row: RouteError) => (
    <div key={`${row[1]}-${row[2]}`} className="dv-err">
      <span className={`dv-s ${statusClass(row[0])}`}>{row[0]}</span>
      <code>{row[1]}</code>
      <span className="dv-em">{language === 'bn' ? row[3] : row[4]}</span>
    </div>
  );

  const method = (m: DocRoute['m']) => <span className={`dv-m ${m.toLowerCase()}`}>{m}</span>;

  const headerRow = (header: DocHeader) => (
    <div key={header.name} className="dv-h">
      <div>
        <code>{header.name}</code>
        {header.eg ? <span className="dv-ty">{header.eg}</span> : null}
      </div>
      <p>{pick(header.what)}</p>
    </div>
  );

  const route = (r: DocRoute) => (
    <details key={r.id} className="dv-route" id={`dv-${r.id}`} open={wide || at === r.id}>
      <summary>
        <span className="dv-line">
          {method(r.m)}
          <code className="dv-path">/v1{r.p}</code>
          {r.sell ? <span className="dv-sell">{w('worksPast')}</span> : null}
          <Chevron />
        </span>
        <span className="dv-what">{pick(r.what)}</span>
      </summary>
      <div className="dv-rb">
        {r.params.length > 0 ? (
          <>
            <div className="dv-sub">{w('parameters')}</div>
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
          </>
        ) : (
          <p className="dv-none">{w('noParameters')}</p>
        )}
        <div className="dv-sub">{w('request')}</div>
        {request(r)}
        {answer(
          r.st ?? 200,
          w('response') + (r.csv ? ' · text/csv' : ''),
          docResponse(r, language),
          r.csv,
        )}
        {r.note ? (
          <p className="dv-note">
            <span>{pick(r.note)}</span>
          </p>
        ) : null}
        <div className="dv-sub">{w('errors')}</div>
        {(r.errs ?? []).map(errorRow)}
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
                  jump('errors');
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

  const nav = (
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
              {method(r.m)}
              <span>{r.p}</span>
            </button>
          ))}
        </Fragment>
      ))}
    </nav>
  );

  return (
    <>
      <div className="dv-layout">
        {wide ? <aside className="dv-side">{nav}</aside> : null}
        <div className="dv-main">
          {wide ? null : (
            <details className="dv-toc">
              <summary>
                <span>{w('onThisPage')}</span>
                <small>{w('tocCount', { routes: DOC_ROUTES.length })}</small>
                <Chevron />
              </summary>
              {nav}
            </details>
          )}
          <section className="dv-sec" id="dv-start">
            <h2>{w('gettingStarted')}</h2>
            <p className="dv-p1">{w('startLead')}</p>
            <ol className="dv-steps">
              <li className="card">
                <b>{w('step1')}</b>
                <p>{w('step1Body')}</p>
                <div className="acts">
                  <a href={signUpUrl} className={buttonClass('accent')}>
                    {w('openShop')}
                  </a>
                  <a href={signInUrl} className={buttonClass('outline')}>
                    {w('haveShop')}
                  </a>
                </div>
              </li>
              <li className="card">
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
              <li className="card">
                <b>{w('step3')}</b>
                <p>{w('step3Body')}</p>
                {request(DOC_FIRST_CALL)}
                {answer(200, w('response'), docResponse(DOC_FIRST_CALL, language))}
              </li>
            </ol>
            <div className="dv-callout">
              <div>
                <b>{w('publicKey')}</b>
                <p>{w('publicKeyBody')}</p>
              </div>
            </div>
          </section>
          <section className="dv-sec" id="dv-auth">
            <h2>{w('authTitle')}</h2>
            <p className="dv-p1">{w('authLead')}</p>
            <h3>{w('requestHeaders')}</h3>
            <div className="dv-hs">{DOC_REQUEST_HEADERS.map(headerRow)}</div>
            <h3>{w('responseHeaders')}</h3>
            <div className="dv-hs">{DOC_RESPONSE_HEADERS.map(headerRow)}</div>
            <h3>{w('envelope')}</h3>
            <p className="dv-p1">{w('envelopeBody')}</p>
            {answer(
              200,
              w('response'),
              JSON.stringify(docEnvelope(DOC_FIRST_CALL, language), null, 2),
            )}
          </section>
          <section className="dv-sec" id="dv-limits">
            <h2>{w('limits')}</h2>
            <p className="dv-p1">{w('limitsLead')}</p>
            <div className="dv-lim">
              {DOC_MINUTE_LIMITS.map(([figure, what]) => (
                <div key={figure + what[1]} className="card dv-lc">
                  <b className="num">{figure}</b>
                  <span>{pick(what)}</span>
                </div>
              ))}
            </div>
            <h3>{w('perCycle')}</h3>
            <div className="dv-plans">
              {plans.map((plan) => (
                <div key={plan.name[1]} className="dv-pl">
                  <span>{pick(plan.name)}</span>
                  <b className="num">{plan.figure}</b>
                </div>
              ))}
            </div>
            <ul className="dv-ul">
              <li>{w('toldAt')}</li>
              <li>{w('pastIt')}</li>
              <li>{w('packRaises')}</li>
              {payg ? <li>{w('paygTerms', payg)}</li> : null}
              <li>{w('notCounted')}</li>
            </ul>
          </section>
          <section className="dv-sec" id="dv-errors">
            <h2>{w('errors')}</h2>
            <p className="dv-p1">{w('errorsLead')}</p>
            {answer(401, w('response'), JSON.stringify(docFailed(language), null, 2))}
            <h3>details.fields</h3>
            <p className="dv-p1">{w('fieldsLead')}</p>
            {answer(400, w('response'), JSON.stringify(docInvalid(language), null, 2))}
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
            <div className="dv-codes">{DOC_COMMON_ERRORS.map(errorRow)}</div>
          </section>
          {DOC_GROUPS.map((group) => {
            const intro = DOC_GROUP_INTROS[group.id];
            return (
              <section key={group.id} className="dv-sec" id={`dv-g-${group.id}`}>
                <h2>{pick(group.t)}</h2>
                {intro ? <p className="dv-p1">{pick(intro)}</p> : null}
                {DOC_ROUTES.filter((r) => r.g === group.id).map(route)}
              </section>
            );
          })}
        </div>
      </div>
      <div className="dv-toast" hidden={!toast} role="status">
        <Check size={18} />
        <span>{w('copied')}</span>
      </div>
    </>
  );
}
