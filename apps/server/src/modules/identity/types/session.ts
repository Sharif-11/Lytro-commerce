export interface SessionSettings {
  secureCookies: boolean;
  /** TEN-29: the only origin a state-changing request may come from; null skips the check (development). */
  origin: string | null;
}

export interface OpenedSession {
  cookie: string;
  csrfToken: string;
}

export interface SessionContext {
  userAgent: string | null;
  ip: string | null;
}
