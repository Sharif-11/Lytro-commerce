import { TUTORIAL_MAX_BYTES, isTutorialShape } from '@lytronix/validators';

// OPERATOR-CONSOLE-DESIGN §10h: what the console reads in a chosen tutorial file before it sends it, so a file the server
// would refuse is never sent. The MP4's own boxes are read (its tracks, their size and codecs, its length), so the
// answer doesn't depend on which codecs this browser can play; the server checks it again with ffmpeg.

/** What a chosen file is, as far as its boxes tell. */
export interface TutorialFileFacts {
  name: string;
  bytes: number;
  width: number | null;
  height: number | null;
  durationSeconds: number | null;
  /** Its first box is `ftyp`. */
  mp4: boolean;
  /** A video track in H.264 (`avc1`, `avc3`), and a sound track in AAC (`mp4a`). */
  videoCodec: boolean;
  audioCodec: boolean;
  /** Its first frame, small, for the chosen-file box; null where this browser can't draw it. */
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

interface Box {
  type: string;
  /** Where its content starts and where the box ends. */
  body: number;
  end: number;
}

const ascii = (bytes: Uint8Array, at: number): string =>
  String.fromCharCode(bytes[at] ?? 0, bytes[at + 1] ?? 0, bytes[at + 2] ?? 0, bytes[at + 3] ?? 0);

/** The boxes inside [start, end) of an MP4's bytes. */
function boxesIn(bytes: Uint8Array, start: number, end: number): Box[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const found: Box[] = [];
  let at = start;
  while (at + 8 <= end) {
    let size = view.getUint32(at);
    let header = 8;
    if (size === 1 && at + 16 <= end) {
      size = Number(view.getBigUint64(at + 8));
      header = 16;
    } else if (size === 0) {
      size = end - at;
    }
    if (size < header || at + size > end) break;
    found.push({ type: ascii(bytes, at + 4), body: at + header, end: at + size });
    at += size;
  }
  return found;
}

const child = (bytes: Uint8Array, box: Box | undefined, type: string): Box | undefined =>
  box ? boxesIn(bytes, box.body, box.end).find((each) => each.type === type) : undefined;

/** What the tracks of a `moov` box say: the picture's size as shown, the codecs, and the length. */
function readMoov(moov: Uint8Array): {
  width: number | null;
  height: number | null;
  duration: number | null;
  video: boolean;
  audio: boolean;
} {
  const view = new DataView(moov.buffer, moov.byteOffset, moov.byteLength);
  const top = boxesIn(moov, 8, moov.length);
  let duration: number | null = null;
  const mvhd = top.find((each) => each.type === 'mvhd');
  if (mvhd) {
    const v1 = moov[mvhd.body] === 1;
    const scale = view.getUint32(mvhd.body + (v1 ? 20 : 12));
    const length = v1 ? Number(view.getBigUint64(mvhd.body + 24)) : view.getUint32(mvhd.body + 16);
    if (scale > 0) duration = length / scale;
  }
  let width: number | null = null;
  let height: number | null = null;
  let video = false;
  let audio = false;
  for (const trak of top.filter((each) => each.type === 'trak')) {
    const mdia = child(moov, trak, 'mdia');
    const hdlr = child(moov, mdia, 'hdlr');
    const handler = hdlr ? ascii(moov, hdlr.body + 8) : '';
    const stsd = child(moov, child(moov, child(moov, mdia, 'minf'), 'stbl'), 'stsd');
    const codecs = stsd ? boxesIn(moov, stsd.body + 8, stsd.end).map((each) => each.type) : [];
    if (handler === 'vide') {
      video ||= codecs.includes('avc1') || codecs.includes('avc3');
      const tkhd = child(moov, trak, 'tkhd');
      if (tkhd && width === null) {
        // The size is the box's last eight bytes (16.16), after its 3 × 3 matrix: a quarter turn swaps them.
        const w = view.getUint32(tkhd.end - 8) / 65536;
        const h = view.getUint32(tkhd.end - 4) / 65536;
        const turned = view.getInt32(tkhd.end - 44) === 0;
        if (w > 0 && h > 0) {
          width = Math.round(turned ? h : w);
          height = Math.round(turned ? w : h);
        }
      }
    }
    if (handler === 'soun') audio ||= codecs.includes('mp4a');
  }
  return { width, height, duration, video, audio };
}

// A file's index is small; anything past this is not one.
const MOOV_MAX = 32 * 1024 * 1024;

/** The MP4's `moov` box (its tracks), wherever it sits, or null; and whether the file is an MP4 at all. */
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

/** The file's first frame, small, from this browser's own player; null where it can't play the file. */
function thumbOf(file: Blob): Promise<string | null> {
  if (typeof document === 'undefined') return Promise.resolve(null);
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement('video');
    let done = false;
    const finish = (thumb: string | null) => {
      if (done) return;
      done = true;
      URL.revokeObjectURL(url);
      resolve(thumb);
    };
    video.muted = true;
    video.preload = 'metadata';
    video.playsInline = true;
    video.onloadedmetadata = () => {
      video.currentTime = Math.min(0.1, video.duration || 0);
    };
    video.onseeked = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = 72;
        canvas.height = 128;
        canvas.getContext('2d')?.drawImage(video, 0, 0, canvas.width, canvas.height);
        finish(canvas.toDataURL('image/jpeg', 0.7));
      } catch {
        finish(null);
      }
    };
    video.onerror = () => {
      finish(null);
    };
    setTimeout(() => {
      finish(null);
    }, 5000);
    video.src = url;
  });
}

/** §10h: reads a chosen file's facts for the three checks. */
export async function readTutorialFile(file: File): Promise<TutorialFileFacts> {
  const [{ mp4, moov }, thumb] = await Promise.all([moovOf(file), thumbOf(file)]);
  const tracks = moov ? readMoov(moov) : null;
  return {
    name: file.name,
    bytes: file.size,
    width: tracks?.width ?? null,
    height: tracks?.height ?? null,
    durationSeconds:
      tracks === null || tracks.duration === null ? null : Math.round(tracks.duration),
    mp4,
    videoCodec: tracks?.video ?? false,
    audioCodec: tracks?.audio ?? false,
    thumb,
  };
}
