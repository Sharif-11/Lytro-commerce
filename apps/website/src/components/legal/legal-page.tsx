import Link from 'next/link';
import type { ReactNode } from 'react';
import { SiteFooter } from '@/components/layout/site-footer';
import { SiteNav } from '@/components/layout/site-nav';
import { Icon } from '@/components/ui/icon';
import { Copy, type Bilingual } from '@/lib/i18n/copy';
import type { Language } from '@/lib/i18n/language';
import type { LegalKind } from '@/lib/legal/legal-library';
import type { Field, LegalBlock, LegalDocument, Run } from '@/lib/legal/legal-markdown';

const text = {
  terms: { bn: 'টার্মস', en: 'Terms' },
  privacy: { bn: 'প্রাইভেসি', en: 'Privacy' },
  sections: { bn: 'অংশগুলো', en: 'Sections' },
  onThisPage: { bn: 'এই পেজে', en: 'On this page' },
  plainly: { bn: 'সহজ কথায়:', en: 'Plainly:' },
  superseded: { bn: 'এটা এখন চালু ভার্সন নয়।', en: "This isn't the version in force." },
  seeCurrent: { bn: 'এখন চালু ভার্সন দেখুন', en: 'See the version in force' },
} satisfies Record<string, Bilingual>;

/** A field whose value is the site's contact page in words ("আমাদের যোগাযোগ পেজের হেল্পলাইন।"), linked there. */
const CONTACT_PAGE_LABELS = ['সহায়তা', 'হেল্পলাইন', 'Help', 'Helpline'];
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const BARE_SITE = /^lytro\.app$/;

/** LEG-01, LEG-02 (Slice 9.8): one version of the terms or the privacy policy in the visitor's language, laid out as the
    sketch's legal pages (docs/brand/lytro-support-legal.html): the band, the section index (sticky from 900 px), the
    header lines, then each numbered section with its plain summary and its blocks. `current` is the version in force
    when this one isn't it. */
export function LegalPage({
  language,
  kind,
  document,
  current,
}: {
  language: Language;
  kind: LegalKind;
  document: LegalDocument;
  current: string | null;
}) {
  const copy = new Copy(language);
  const idOf = (index: number) => `${kind === 'terms' ? 't' : 'p'}${String(index + 1)}`;
  return (
    <>
      <SiteNav language={language} />
      <main className="legal-page">
        <section className="band on-dark">
          <div className="glow" aria-hidden="true" />
          <div className="wrap">
            <div className="crumbs">
              <span>lytro.app</span>
              <span>/</span>
              <b>{copy.of(text[kind])}</b>
            </div>
            <h1>{document.title}</h1>
          </div>
        </section>
        <section className="legal-body">
          <div className="wrap">
            <div className="legal-wrap">
              <nav className="toc" aria-label={copy.of(text.sections)}>
                <p className="toc-title">{copy.of(text.onThisPage)}</p>
                <ol>
                  {document.sections.map((section, index) => (
                    <li key={idOf(index)}>
                      <a href={`#${idOf(index)}`}>
                        {section.number}. {section.title}
                      </a>
                    </li>
                  ))}
                </ol>
              </nav>
              <div className="doc">
                <div className="meta">
                  {document.fields.map((field) => (
                    <span key={field.label}>
                      {field.label}: {field.value}
                    </span>
                  ))}
                </div>
                {current !== null ? (
                  <p className="superseded">
                    {copy.of(text.superseded)}{' '}
                    <Link href={`/${kind}`}>{copy.of(text.seeCurrent)}</Link>
                  </p>
                ) : null}
                {document.intro.length > 0 ? (
                  <div className="intro">
                    {document.intro.map((block, index) => (
                      <Block key={String(index)} block={block} />
                    ))}
                  </div>
                ) : null}
                {document.sections.map((section, index) => (
                  <section key={idOf(index)} className="clause" id={idOf(index)}>
                    <h2>
                      <small>{section.number}</small>
                      <span>{section.title}</span>
                    </h2>
                    {section.plainly ? (
                      <div className="plain">
                        <Icon name="info" size={18} />
                        <span>
                          <b>{copy.of(text.plainly)}</b> <Runs runs={section.plainly} />
                        </span>
                      </div>
                    ) : null}
                    {section.blocks.map((block, blockIndex) => (
                      <Block key={String(blockIndex)} block={block} />
                    ))}
                  </section>
                ))}
              </div>
            </div>
          </div>
        </section>
      </main>
      <SiteFooter language={language} />
    </>
  );
}

function Block({ block }: { block: LegalBlock }) {
  switch (block.kind) {
    case 'paragraph':
      return (
        <p>
          <Runs runs={block.runs} />
        </p>
      );
    case 'label':
      return (
        <p className="sublabel">
          <b>{block.text}</b>
        </p>
      );
    case 'field':
      return <FieldLine field={block.field} />;
    case 'subheading':
      return <h3>{block.text}</h3>;
    case 'list':
      return (
        <ul>
          {block.items.map((runs, index) => (
            <li key={String(index)}>
              <Runs runs={runs} />
            </li>
          ))}
        </ul>
      );
    case 'numbered':
      return (
        <ol className="numbered">
          {block.items.map((item) => (
            <li key={item.number}>
              <span className="n">{item.number}.</span>
              <span>
                <Runs runs={item.runs} />
              </span>
            </li>
          ))}
        </ol>
      );
    case 'table':
      return (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                {block.head.map((cell, index) => (
                  <th key={String(index)} scope="col">
                    <Runs runs={cell} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, rowIndex) => (
                <tr key={String(rowIndex)}>
                  {row.map((cell, index) => (
                    <td key={String(index)}>
                      <Runs runs={cell} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    case 'rule':
      return <hr />;
  }
}

/** A contact line: the label in bold, then the value, linked when it is an address, the site or the contact page. */
function FieldLine({ field }: { field: Field }) {
  let value: ReactNode = <Linked text={field.value} />;
  if (BARE_SITE.test(field.value)) value = <a href="https://lytro.app">{field.value}</a>;
  else if (CONTACT_PAGE_LABELS.includes(field.label))
    value = <Link href="/contact">{field.value}</Link>;
  return (
    <p className="field">
      <b>{field.label}:</b> {value}
    </p>
  );
}

function Runs({ runs }: { runs: Run[] }) {
  return runs.map((run, index) =>
    run.bold ? (
      <b key={String(index)}>
        <Linked text={run.text} />
      </b>
    ) : (
      <Linked key={String(index)} text={run.text} />
    ),
  );
}

/** Plain text with every email address as a mail link. */
function Linked({ text: value }: { text: string }) {
  const parts: ReactNode[] = [];
  let at = 0;
  for (const match of value.matchAll(EMAIL)) {
    if (match.index > at) parts.push(value.slice(at, match.index));
    parts.push(
      <a key={match.index} href={`mailto:${match[0]}`}>
        {match[0]}
      </a>,
    );
    at = match.index + match[0].length;
  }
  if (at < value.length) parts.push(value.slice(at));
  return parts;
}
