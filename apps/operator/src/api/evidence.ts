import { useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ApiClientError } from '@lytronix/api-client';
import { operatorSession } from '@/session/operator-session';

/** A payment screenshot as this page holds it while its panel is open (ADM-17, D8-47). */
export interface EvidenceFile {
  /** This page's own address for its copy (`blob:`), let go when the panel closes. */
  url: string;
  /** A picture draws in the panel; a PDF opens in its own tab. */
  isImage: boolean;
}

/**
 * Why a screenshot didn't come: removed after its two years (D8-47, the server's `conflict`), or not read this time, which
 * says nothing about whether it is still kept.
 */
export type EvidenceFailure = 'removed' | 'unreadable';

/**
 * ADM-17, D8-47 (amended 2026-11-20): a screenshot read through the server with the operator's own session, never by an
 * R2 link, which R2 refuses from any address but the server's. Read as its panel opens, and kept nowhere once it closes.
 */
export function useEvidenceFile(path: string): {
  file: EvidenceFile | undefined;
  failure: EvidenceFailure | null;
} {
  const read = useQuery({
    queryKey: ['operator', 'evidence', path],
    queryFn: () => operatorSession.client.file(path),
    retry: false,
    gcTime: 0,
    staleTime: 0,
  });
  const blob = read.data;
  const url = useMemo(() => (blob ? URL.createObjectURL(blob) : undefined), [blob]);
  useEffect(
    () => () => {
      if (url) URL.revokeObjectURL(url);
    },
    [url],
  );
  return {
    file: url && blob ? { url, isImage: blob.type.startsWith('image/') } : undefined,
    failure: !read.isError
      ? null
      : read.error instanceof ApiClientError && read.error.code === 'conflict'
        ? 'removed'
        : 'unreadable',
  };
}
