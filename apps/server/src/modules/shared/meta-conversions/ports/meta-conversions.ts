/**
 * Who an event is about, as Meta's Conversions API takes it. Identifiers are SHA-256 hashes of their normalised forms;
 * the IP address, browser and Meta's own `_fbp`/`_fbc` cookie values go as they are (Meta's rules).
 */
export interface MetaUserData {
  ph?: string[];
  ct?: string[];
  external_id?: string[];
  client_ip_address?: string;
  client_user_agent?: string;
  fbp?: string;
  fbc?: string;
}

/**
 * One server event in the form Meta's Conversions API takes it: a shop's `Purchase` (LND-16) or one of Lytro's own
 * sign-up and plan events (MKT-02).
 */
export interface MetaServerEvent {
  event_name: string;
  event_time: number;
  event_id: string;
  // `website` for an event a visitor's browser was part of; `system_generated` for one Lytro's server saw alone (a
  // shop's first order, its first paid plan), which has no browser or page to name (MKT-02).
  action_source: 'website' | 'system_generated';
  event_source_url?: string;
  user_data: MetaUserData;
  custom_data?: Record<string, unknown>;
}

/** MKT-05: a test event code sends the events to Events Manager's "Test events" tab instead of the live data. */
export interface MetaSendOptions {
  testEventCode?: string;
}

/**
 * LND-16, MKT-02: Meta's Conversions API. Sends events to a pixel with its token; any failure throws, so the job
 * carrying the events tries again. The token is never logged or put in an error.
 */
export interface MetaConversions {
  send(
    pixelId: string,
    accessToken: string,
    events: MetaServerEvent[],
    options?: MetaSendOptions,
  ): Promise<void>;
}
