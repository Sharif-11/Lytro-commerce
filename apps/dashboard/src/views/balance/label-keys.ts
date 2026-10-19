import { LedgerEntryType, RateKey } from '@lytronix/validators';

/** One dictionary key per ledger entry type and per rate key, so the enums stay the single source. */
export const TYPE_LABEL_KEYS: Record<LedgerEntryType, string> = {
  [LedgerEntryType.TopUp]: 'balance.type.topUp',
  [LedgerEntryType.Sms]: 'balance.type.sms',
  [LedgerEntryType.Ai]: 'balance.type.ai',
  [LedgerEntryType.Extraction]: 'balance.type.extraction',
  [LedgerEntryType.FraudCheck]: 'balance.type.fraudCheck',
  [LedgerEntryType.OrderFee]: 'balance.type.orderFee',
  [LedgerEntryType.ProductFee]: 'balance.type.productFee',
  [LedgerEntryType.PlanPayment]: 'balance.type.planPayment',
  [LedgerEntryType.Adjustment]: 'balance.type.adjustment',
  [LedgerEntryType.Reversal]: 'balance.type.reversal',
  [LedgerEntryType.CarryOver]: 'balance.type.carryOver',
};

export const RATE_LABEL_KEYS: Record<RateKey, string> = {
  [RateKey.SmsPerUnit]: 'balance.rate.smsPerUnit',
  [RateKey.AiReply]: 'balance.rate.aiReply',
  [RateKey.FraudCheck]: 'balance.rate.fraudCheck',
  [RateKey.PaygOrderFeeMin]: 'balance.rate.paygOrderFeeMin',
  [RateKey.PaygOrderFeePct]: 'balance.rate.paygOrderFeePct',
  [RateKey.PaygProductFee]: 'balance.rate.paygProductFee',
  [RateKey.SmsUnitSizeChars]: 'balance.rate.smsUnitSizeChars',
};
