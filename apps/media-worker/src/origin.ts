import { AwsClient } from 'aws4fetch';

/** MED-02: where a file is read from on a cache miss. */
export interface MediaOrigin {
  /**
   * The object, or the asked-for part of it; null when there is no such object. A store that cannot be reached
   * throws StoreUnavailable.
   */
  get(key: string, range: string | null): Promise<Response | null>;
}

/** MED-11: the store could not be reached, or would not answer. */
export class StoreUnavailable extends Error {
  constructor(detail: string) {
    super(`media store unavailable: ${detail}`);
    this.name = 'StoreUnavailable';
  }
}

/** MED-07: R2's S3 address, the media bucket, and the read-only key. */
export interface S3OriginSettings {
  endpoint: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
}

// What a response from the store passes on; the store's own headers stay behind.
const PASSED_ON = ['content-type', 'content-length', 'content-range', 'etag', 'last-modified'];

/**
 * MED-02, MED-07: R2 read through its S3 API with a read-only key, so nothing this Worker does can write or delete
 * (a binding would allow both). Each read is signed with the key; a range is asked for as such.
 */
export class S3Origin implements MediaOrigin {
  private readonly client: AwsClient;

  constructor(
    private readonly settings: S3OriginSettings,
    private readonly fetcher: (request: Request) => Promise<Response> = (request) => fetch(request),
  ) {
    this.client = new AwsClient({
      accessKeyId: settings.accessKeyId,
      secretAccessKey: settings.secretAccessKey,
      service: 's3',
      region: 'auto',
    });
  }

  async get(key: string, range: string | null): Promise<Response | null> {
    const url = `${this.settings.endpoint.replace(/\/+$/, '')}/${this.settings.bucket}/${key}`;
    let answer: Response;
    try {
      const signed = await this.client.sign(url, {
        method: 'GET',
        headers: range === null ? {} : { range },
      });
      answer = await this.fetcher(signed);
    } catch (error) {
      throw new StoreUnavailable(String(error));
    }
    if (answer.status === 404) {
      await answer.body?.cancel();
      return null;
    }
    if (answer.status !== 200 && answer.status !== 206 && answer.status !== 416) {
      await answer.body?.cancel();
      throw new StoreUnavailable(`R2 answered ${String(answer.status)}`);
    }
    const headers = new Headers({ 'accept-ranges': 'bytes' });
    for (const name of PASSED_ON) {
      const value = answer.headers.get(name);
      if (value !== null) headers.set(name, value);
    }
    return new Response(answer.body, { status: answer.status, headers });
  }
}
