// A file was refused (STO-04 to STO-06): not a kind of media this platform takes, judged by its content and never by its
// name ('not_supported'), larger than its kind allows ('too_large'), or a kind it is but cannot be read
// ('unreadable'). The processor reports it by kind, so the upload can tell the shop clearly.
export class MediaRefused extends Error {
  constructor(readonly kind: 'not_supported' | 'too_large' | 'unreadable') {
    super(`media refused: ${kind}`);
    this.name = 'MediaRefused';
  }
}

// MED-11: the media store could not be reached. The caller answers 503 with a hint to retry; nothing else is affected.
export class StorageUnavailable extends Error {
  constructor(cause?: unknown) {
    super('media storage unavailable', { cause });
    this.name = 'StorageUnavailable';
  }
}
