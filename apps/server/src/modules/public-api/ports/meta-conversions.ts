/** LND-16: one server event in the form Meta's Conversions API takes it. */
export interface MetaServerEvent {
  event_name: 'Purchase';
  event_time: number;
  event_id: string;
  action_source: 'website';
  user_data: { ph: string[]; ct?: string[] };
  custom_data: {
    currency: 'BDT';
    value: number;
    content_type: 'product';
    content_ids: string[];
    contents: { id: string; quantity: number }[];
    order_id: string;
  };
}

/**
 * LND-16: Meta's Conversions API. Sends a shop's events to its pixel with the shop's own token; any failure throws, so
 * the job carrying the event tries again. The token is never logged or put in an error.
 */
export interface MetaConversions {
  send(pixelId: string, accessToken: string, events: MetaServerEvent[]): Promise<void>;
}
