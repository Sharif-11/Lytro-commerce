// A one-time code could not be emailed during its request. The caller must be told, because no code arrived.
export class MailDeliveryError extends Error {
  constructor() {
    super('mail delivery failed');
    this.name = 'MailDeliveryError';
  }
}
