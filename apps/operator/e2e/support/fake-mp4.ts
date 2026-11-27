// OPERATOR-CONSOLE-DESIGN §10h: an MP4 made of just the boxes the console reads -- `ftyp`, then `moov` with its length
// (`mvhd`) and its tracks (`tkhd`'s size, `hdlr`'s kind, `stsd`'s codec) -- and an empty `mdat` making up its size. The
// console's checks read these alone, so a test needs no real video (Playwright's Chromium has no H.264 to play one).

export interface FakeMp4 {
  width: number;
  height: number;
  seconds: number;
  /** The video codec's sample entry: `avc1` is H.264. */
  video?: string;
  /** The sound's, or none: `mp4a` is AAC. */
  audio?: string | null;
  /** The whole file's size, in MB (the `mdat` makes it up). */
  mb?: number;
}

const MB = 1024 * 1024;

function u32(value: number): Buffer {
  const out = Buffer.alloc(4);
  out.writeUInt32BE(value >>> 0);
  return out;
}

function u16(value: number): Buffer {
  const out = Buffer.alloc(2);
  out.writeUInt16BE(value);
  return out;
}

const text = (value: string): Buffer => Buffer.from(value, 'latin1');

function box(type: string, ...parts: Buffer[]): Buffer {
  const body = Buffer.concat(parts);
  return Buffer.concat([u32(body.length + 8), text(type), body]);
}

// The identity matrix: no turn.
const MATRIX = Buffer.concat([0x10000, 0, 0, 0, 0x10000, 0, 0, 0, 0x40000000].map(u32));

function track(id: number, handler: string, codec: string, width: number, height: number): Buffer {
  const tkhd = box(
    'tkhd',
    u32(3),
    u32(0),
    u32(0),
    u32(id),
    u32(0),
    u32(0),
    Buffer.alloc(8),
    u16(0),
    u16(0),
    u16(handler === 'soun' ? 0x0100 : 0),
    u16(0),
    MATRIX,
    u32(width * 0x10000),
    u32(height * 0x10000),
  );
  const hdlr = box('hdlr', u32(0), u32(0), text(handler), Buffer.alloc(12), Buffer.alloc(1));
  const stsd = box('stsd', u32(0), u32(1), box(codec, Buffer.alloc(8)));
  return box('trak', tkhd, box('mdia', hdlr, box('minf', box('stbl', stsd))));
}

/** The file's bytes. */
export function fakeMp4(spec: FakeMp4): Buffer {
  const ftyp = box('ftyp', text('isom'), u32(512), text('isom'), text('avc1'));
  const mvhd = box(
    'mvhd',
    u32(0),
    u32(0),
    u32(0),
    u32(1000),
    u32(spec.seconds * 1000),
    u32(0x10000),
    u16(0x0100),
    Buffer.alloc(10),
    MATRIX,
    Buffer.alloc(24),
    u32(3),
  );
  const tracks = [track(1, 'vide', spec.video ?? 'avc1', spec.width, spec.height)];
  if (spec.audio !== null) tracks.push(track(2, 'soun', spec.audio ?? 'mp4a', 0, 0));
  const head = Buffer.concat([ftyp, box('moov', mvhd, ...tracks)]);
  const total = Math.max(head.length + 8, Math.round((spec.mb ?? 1) * MB));
  return Buffer.concat([head, box('mdat', Buffer.alloc(total - head.length - 8))]);
}
