// An OTP could not be sent during its request. The owner must be told, because no code arrived.
export class SmsDeliveryError extends Error {
  constructor() {
    super('sms delivery failed');
    this.name = 'SmsDeliveryError';
  }
}
