export interface SessionSettings {
  secureCookies: boolean;
}

export interface OpenedSession {
  cookie: string;
  csrfToken: string;
}

export interface SessionContext {
  userAgent: string | null;
  ip: string | null;
}
