import type { WindowVerdict } from '../../../../common/sliding-window';

/**
 * D9-15, RED-02, RED-03 (Slice 9.4): every rate limit's one store. Its callers never know whether Redis or this
 * process's memory answers (PHASE-9-PLAN §3.6). A bucket names what it limits (`ip:<shop>:<address>`); the window is
 * exact and sliding: a limit of 120 a minute means 120 in any 60 seconds.
 */
export interface LimitStore {
  /** Counts a request in the bucket if it's under the limit. A refused request is not counted. */
  take(bucket: string, limit: number, windowMs: number, now: Date): Promise<WindowVerdict>;
  /** What `take` would answer, counting nothing: a limit on failures, checked before the attempt (LSN-10). */
  peek(bucket: string, limit: number, windowMs: number, now: Date): Promise<WindowVerdict>;
}

/** Whether the shared Redis answers, for the ready check (D9-21) and the operators' email (RED-05). */
export type SharedStoreState = 'up' | 'down' | 'not_configured';
