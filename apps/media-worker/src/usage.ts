import { MEDIA_USAGE_POINT } from '@lytronix/shared-types';

/** BND-01: whether a file was public or private, as its usage is recorded. */
export type MediaAccess = 'public' | 'private';

/** BND-01: records each response's usage for the server's totals. */
export interface UsageRecorder {
  record(tenantId: string, access: MediaAccess, status: number, bytes: number): void;
}

/** BND-01, MED-10: one Analytics Engine data point per response, laid out as the server reads it. */
export class AnalyticsUsageRecorder implements UsageRecorder {
  constructor(private readonly dataset: AnalyticsEngineDataset) {}

  record(tenantId: string, access: MediaAccess, status: number, bytes: number): void {
    const doubles: number[] = [];
    doubles[MEDIA_USAGE_POINT.bytesDouble] = bytes;
    doubles[MEDIA_USAGE_POINT.requestsDouble] = 1;
    const blobs: string[] = [];
    blobs[MEDIA_USAGE_POINT.accessBlob] = access;
    blobs[MEDIA_USAGE_POINT.statusBlob] = String(status);
    try {
      this.dataset.writeDataPoint({ indexes: [tenantId], doubles, blobs });
    } catch (error) {
      // Counting must never stop media being served.
      console.error('media worker: usage could not be recorded', error);
    }
  }
}

/**
 * BND-01: the response, its body counted as it is sent, so a range counts only its bytes and a download stopped
 * part-way counts only what went. `done` is told the bytes once the body has ended, either way. A response with a
 * length keeps it.
 */
export function counted(
  response: Response,
  ctx: ExecutionContext,
  done: (bytes: number) => void,
): Response {
  const body = response.body;
  if (body === null) {
    done(0);
    return response;
  }
  let bytes = 0;
  let reported = false;
  const report = (): void => {
    if (reported) return;
    reported = true;
    done(bytes);
  };
  const counter = new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      bytes += chunk.byteLength;
      controller.enqueue(chunk);
    },
  });
  const length = response.headers.get('content-length');
  const sink =
    length !== null && /^\d+$/.test(length)
      ? new FixedLengthStream(Number(length))
      : new TransformStream<Uint8Array, Uint8Array>();
  ctx.waitUntil(
    body
      .pipeThrough(counter)
      .pipeTo(sink.writable)
      .catch(() => undefined)
      .finally(report),
  );
  return new Response(sink.readable, response);
}
