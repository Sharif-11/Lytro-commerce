import { TUTORIAL_MAX_BYTES, isTutorialShape } from '@lytronix/validators';

// OPERATOR-CONSOLE-DESIGN §10h: what the console reads in a chosen tutorial file before it sends it, so a file the
// server would refuse is never sent. The server checks it again by its content with ffmpeg; this is for the operator.

/** What a chosen file is, as far as the browser can tell. */
export interface TutorialFileFacts {
  name: string;
  bytes: number;
  width: number | null;
  height: number | null;
  durationSeconds: number | null;
  /** An MP4 (its first box is `ftyp`) whose tracks are H.264 video and AAC sound. */
  mp4: boolean;
  videoCodec: boolean;
  audioCodec: boolean;
  /** Its first frame, small, for the chosen-file box; null where the browser can't draw it. */
  thumb: string | null;
}

/** The three checks the upload sheet shows. */
export interface TutorialFileChecks {
  shape: boolean;
  codecs: boolean;
  size: boolean;
}

export function checksOf(facts: TutorialFileFacts): TutorialFileChecks {
  return {
    shape:
      facts.width !== null && facts.height !== null && isTutorialShape(facts.width, facts.height),
    codecs: facts.mp4 && facts.videoCodec && facts.audioCodec,
    size: facts.bytes <= TUTORIAL_MAX_BYTES,
  };
}

const ascii = (bytes: Uint8Array, at: number): string =>
  String.fromCharCode(bytes[at] ?? 0, bytes[at + 1] ?? 0, bytes[at + 2] ?? 0, bytes[at + 3] ?? 0);

/** Whether a 4-letter code appears in the bytes (a track's sample entry in `stsd`). */
function holds(bytes: Uint8Array, code: string): boolean {
  for (let at = 0; at + 4 <= bytes.length; at += 1) {
    if (ascii(bytes, at) === code) return true;
  }
  return false;
}

// A file's box index is small; anything past this is not one.
const MOOV_MAX = 32 * 1024 * 1024;

/** The MP4's `moov` box (its tracks), wherever it sits, or null when the file is not an MP4. */
async function moovOf(file: Blob): Promise<{ mp4: boolean; moov: Uint8Array | null }> {
  let offset = 0;
  while (offset + 8 <= file.size) {
    const head = new Uint8Array(await file.slice(offset, offset + 16).arrayBuffer());
    const view = new DataView(head.buffer);
    let size = view.getUint32(0);
    const type = ascii(head, 4);
    let header = 8;
    if (size === 1 && head.length >= 16) {
      size = Number(view.getBigUint64(8));
      header = 16;
    } else if (size === 0) {
      size = file.size - offset;
    }
    if (offset === 0 && type !== 'ftyp') return { mp4: false, moov: null };
    if (size < header) return { mp4: true, moov: null };
    if (type === 'moov') {
      if (size > MOOV_MAX) return { mp4: true, moov: null };
      return {
        mp4: true,
        moov: new Uint8Array(await file.slice(offset, offset + size).arrayBuffer()),
      };
    }
    offset += size;
  }
  return { mp4: offset > 0, moov: null };
}

/** The picture's size, length and first frame, from the browser's own player; nulls where it can't read them. */
function pictureOf(file: Blob): Promise<{
  width: number | null;
  height: number | null;
  duration: number | null;
  thumb: string | null;
}> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement('video');
    let done = false;
    const finish = (result: {
      width: number | null;
      height: number | null;
      duration: number | null;
      thumb: string | null;
    }) => {
      if (done) return;
      done = true;
      URL.revokeObjectURL(url);
      resolve(result);
    };
    const facts = () => ({
      width: video.videoWidth || null,
      height: video.videoHeight || null,
      duration: Number.isFinite(video.duration) ? video.duration : null,
    });
    video.muted = true;
    video.preload = 'metadata';
    video.playsInline = true;
    video.onloadedmetadata = () => {
      video.currentTime = Math.min(0.1, video.duration || 0);
    };
    video.onseeked = () => {
      let thumb: string | null = null;
      try {
        const canvas = document.createElement('canvas');
        canvas.width = 72;
        canvas.height = 128;
        canvas.getContext('2d')?.drawImage(video, 0, 0, canvas.width, canvas.height);
        thumb = canvas.toDataURL('image/jpeg', 0.7);
      } catch {
        thumb = null;
      }
      finish({ ...facts(), thumb });
    };
    video.onerror = () => {
      finish({ width: null, height: null, duration: null, thumb: null });
    };
    // A browser that reads the size but can't seek still answers within a few seconds.
    setTimeout(() => {
      finish({ ...facts(), thumb: null });
    }, 8000);
    video.src = url;
  });
}

/** §10h: reads a chosen file's facts for the three checks. */
export async function readTutorialFile(file: File): Promise<TutorialFileFacts> {
  const [{ mp4, moov }, picture] = await Promise.all([moovOf(file), pictureOf(file)]);
  return {
    name: file.name,
    bytes: file.size,
    width: picture.width,
    height: picture.height,
    durationSeconds: picture.duration === null ? null : Math.round(picture.duration),
    mp4,
    // H.264's sample entries are avc1 and avc3; AAC's is mp4a (TUTORIAL_VIDEO_CODEC, TUTORIAL_AUDIO_CODEC).
    videoCodec: moov !== null && (holds(moov, 'avc1') || holds(moov, 'avc3')),
    audioCodec: moov !== null && holds(moov, 'mp4a'),
    thumb: picture.thumb,
  };
}
