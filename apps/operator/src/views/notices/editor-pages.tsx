import { useMemo } from 'react';
import { useParams, useSearch } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { ApiClientError } from '@lytronix/api-client';
import { NoticeStatus, NoticeTemplate } from '@lytronix/validators';
import { useNotice, useNoticeTemplate } from '@/api/notices';
import { useRateChange } from '@/api/rates';
import { ConsoleCard, ConsolePage } from '@/components/ui/console-page';
import { EmptyBox } from '@/components/ui/data-table';
import { LoadFailed } from '@/components/ui/load-failed';
import type { NoticeTemplateRequest } from '@/types/notices';
import { NoticeDetail } from './detail';
import { NoticeEditor, type EditorMode } from './editor';

function Waiting(): React.JSX.Element {
  return (
    <ConsolePage>
      <span className="skel h-7! w-1/3" />
      <span className="skel w-2/3" />
    </ConsolePage>
  );
}

function Missing({ onRetry, error }: { onRetry: () => void; error: unknown }): React.JSX.Element {
  const { t } = useTranslation();
  const missing = error instanceof ApiClientError && error.status === 404;
  return (
    <ConsolePage>
      {missing ? (
        <ConsoleCard className="p-0!">
          <EmptyBox icon="bell" title={t('notices.empty')} hint={t('notices.emptyHint')} />
        </ConsoleCard>
      ) : (
        <LoadFailed onRetry={onRetry} />
      )}
    </ConsolePage>
  );
}

/** NTC-12, NTC-13: the editor for a new notice, filled from a template or a rate change when one is named. */
export function NewNotice(): React.JSX.Element {
  const search = useSearch({ from: '/_console/notices/new' });
  const request = useMemo((): NoticeTemplateRequest | null => {
    if (search.rateChange !== undefined) {
      return {
        template: NoticeTemplate.RateChange,
        variables: { rateChangeId: search.rateChange },
      };
    }
    if (!search.template) return null;
    if (search.template === NoticeTemplate.Maintenance) {
      return {
        template: search.template,
        variables: {
          ...(search.from ? { windowStartsAt: search.from } : {}),
          ...(search.to ? { windowEndsAt: search.to } : {}),
        },
      };
    }
    // An outage is written as of now: "Since 7 Nov, 9:40 pm".
    if (search.template === NoticeTemplate.Outage) {
      return { template: search.template, variables: { date: new Date().toISOString() } };
    }
    return { template: search.template, variables: {} };
  }, [search.rateChange, search.template, search.from, search.to]);
  const draft = useNoticeTemplate(request);
  const change = useRateChange(search.rateChange ?? null);
  if (request && draft.isError) {
    return (
      <Missing
        error={draft.error}
        onRetry={() => {
          void draft.refetch();
        }}
      />
    );
  }
  if ((request && !draft.data) || change.loading) return <Waiting />;
  const mode: EditorMode = search.rateChange !== undefined ? 'rate' : 'new';
  return (
    <NoticeEditor
      key={JSON.stringify(request)}
      start={{
        mode,
        notice: null,
        draft: draft.data ?? null,
        template: request?.template ?? null,
        rateChange: change.change,
      }}
    />
  );
}

/** A notice's own page: a draft opens in the editor, anything sent or scheduled as its page (NTC-08, NTC-09). */
export function NoticePage(): React.JSX.Element {
  const { id } = useParams({ from: '/_console/notices/$id/' });
  const notice = useNotice(id);
  if (notice.isError) {
    return (
      <Missing
        error={notice.error}
        onRetry={() => {
          void notice.refetch();
        }}
      />
    );
  }
  if (!notice.data) return <Waiting />;
  if (notice.data.status === NoticeStatus.Draft) {
    return (
      <NoticeEditor
        key={notice.data.id}
        start={{
          mode: 'draft',
          notice: notice.data,
          draft: null,
          template: null,
          rateChange: null,
        }}
      />
    );
  }
  return <NoticeDetail notice={notice.data} />;
}

const EDIT_MODES: Partial<Record<NoticeStatus, EditorMode>> = {
  [NoticeStatus.Draft]: 'draft',
  [NoticeStatus.Scheduled]: 'scheduled',
  [NoticeStatus.Live]: 'live',
};

/** NTC-08: a scheduled notice edited freely; a live one under its warning, its go-live time fixed. */
export function EditNotice(): React.JSX.Element {
  const { id } = useParams({ from: '/_console/notices/$id/edit' });
  const notice = useNotice(id);
  if (notice.isError) {
    return (
      <Missing
        error={notice.error}
        onRetry={() => {
          void notice.refetch();
        }}
      />
    );
  }
  if (!notice.data) return <Waiting />;
  const mode = EDIT_MODES[notice.data.status];
  // An ended or withdrawn notice can't change: its page says so.
  if (!mode) return <NoticeDetail notice={notice.data} />;
  return (
    <NoticeEditor
      key={notice.data.id}
      start={{ mode, notice: notice.data, draft: null, template: null, rateChange: null }}
    />
  );
}
