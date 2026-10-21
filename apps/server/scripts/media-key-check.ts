import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import {
  DeleteObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
  S3ServiceException,
} from '@aws-sdk/client-s3';

// MED-07: checks what each media key may really do against the configured buckets, for the key inventory
// (docs/RUNBOOKS.md §2). Run it after making or rotating a key:
//   pnpm --filter @lytronix/server exec tsx scripts/media-key-check.ts
// It writes one small object under `key-check/` in the media bucket (outside every shop's prefix) and removes it.

type Job = 'SIGNER' | 'PROCESSOR' | 'DELETER';

function setting(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set; see apps/server/.env.example`);
  return value;
}

function clientFor(job: Job): S3Client {
  return new S3Client({
    endpoint: setting('MEDIA_STORAGE_ENDPOINT'),
    region: process.env['MEDIA_STORAGE_REGION'] ?? 'auto',
    forcePathStyle: (process.env['MEDIA_STORAGE_PATH_STYLE'] ?? 'true') === 'true',
    credentials: {
      accessKeyId: setting(`MEDIA_${job}_ACCESS_KEY`),
      secretAccessKey: setting(`MEDIA_${job}_SECRET_KEY`),
    },
  });
}

/** Whether the store let the call through: true, or false when it refused it as not allowed. */
async function allowed(call: () => Promise<unknown>): Promise<boolean> {
  try {
    await call();
    return true;
  } catch (error) {
    if (
      error instanceof S3ServiceException &&
      [401, 403].includes(error.$metadata.httpStatusCode ?? 0)
    ) {
      return false;
    }
    throw error;
  }
}

async function main(): Promise<void> {
  const mediaBucket = process.env['MEDIA_BUCKET'] ?? 'lytro-media';
  const key = `key-check/${randomUUID()}.txt`;
  const put = (job: Job) => () =>
    clientFor(job).send(
      new PutObjectCommand({ Bucket: mediaBucket, Key: key, Body: 'MED-07 key check' }),
    );
  const remove = (job: Job) => () =>
    clientFor(job).send(new DeleteObjectCommand({ Bucket: mediaBucket, Key: key }));
  const present = async (): Promise<boolean> =>
    allowed(() =>
      clientFor('DELETER').send(new HeadObjectCommand({ Bucket: mediaBucket, Key: key })),
    );

  const lines: string[] = [];
  lines.push(
    `signer writes to the media bucket: ${(await allowed(put('SIGNER'))) ? 'YES (scope it to uploads only)' : 'no'}`,
  );
  if (!(await allowed(put('PROCESSOR'))))
    throw new Error('the processor key cannot write media; it must');
  lines.push('processor writes to the media bucket: yes');
  const processorDeleted = (await allowed(remove('PROCESSOR'))) && !(await present());
  lines.push(
    `processor deletes from the media bucket: ${processorDeleted ? 'YES (R2 cannot split write from delete)' : 'no'}`,
  );
  if (!processorDeleted) {
    if (!(await allowed(remove('DELETER'))))
      throw new Error('the deleter key cannot delete media; it must');
    lines.push('deleter deletes from the media bucket: yes');
  }
  console.log(lines.join('\n'));
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
