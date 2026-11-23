/**
 * How the queues every order feeds (its SMS, its fraud check, its notifications) are worked, from the 2026-11-21
 * production load test: with pg-boss's defaults each sent about one job every 9 seconds while orders came in (one job
 * per NOTIFY wake-up) and one every 30 seconds after (the NOTIFY backstop), so 32,000 SMS stood waiting.
 *
 * - One job per fetch, as before: if a handler throws, pg-boss retries what it fetched, and a batch would send an SMS
 *   that already went out a second time.
 * - burstWhenReadyExceeds: while the queue's cached count shows a backlog, fetch again at once instead of waiting.
 *   pg-boss stops bursting as soon as a fetch comes back empty, so a drained queue never spins.
 * - Two at once in each process: a slow provider (a courier's fraud check, an SMS gateway) holds only half the queue.
 */
export const DRAIN_BACKLOG = { burstWhenReadyExceeds: 1, localConcurrency: 2 };
