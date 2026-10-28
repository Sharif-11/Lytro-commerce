/**
 * Reading barcodes from a camera's video (agreed for Slice 11.7: the browser's BarcodeDetector where it has one, the
 * zxing reader loaded only where it does not, mainly an iPhone's Safari). A phone's box carries its IMEI as Code 128;
 * other products' serials come as any of the common linear and 2D codes.
 */

/** The part of the browser's BarcodeDetector (Shape Detection API) used here; TypeScript's DOM types lack it. */
interface Detector {
  detect(source: HTMLVideoElement): Promise<{ rawValue: string }[]>;
}
interface DetectorClass {
  new (options: { formats: string[] }): Detector;
  getSupportedFormats(): Promise<string[]>;
}

const FORMATS = [
  'code_128',
  'code_39',
  'code_93',
  'codabar',
  'ean_13',
  'ean_8',
  'itf',
  'upc_a',
  'upc_e',
  'qr_code',
  'data_matrix',
];

/** How often the browser's detector looks at the video. */
const EVERY_MS = 250;

/**
 * Reads codes from the playing video until the returned function stops it; each code read calls `onCode`, as often as
 * the code stays in view (the caller ignores one it already has).
 */
export async function readBarcodes(
  video: HTMLVideoElement,
  onCode: (raw: string) => void,
): Promise<() => void> {
  const native = (window as unknown as { BarcodeDetector?: DetectorClass }).BarcodeDetector;
  if (native) {
    const supported = await native.getSupportedFormats();
    const detector = new native({ formats: FORMATS.filter((each) => supported.includes(each)) });
    let timer: number | undefined;
    let stopped = false;
    const look = async (): Promise<void> => {
      try {
        for (const each of await detector.detect(video)) onCode(each.rawValue);
      } catch {
        // A frame not ready yet; the next look tries again.
      }
      if (!stopped) timer = window.setTimeout(() => void look(), EVERY_MS);
    };
    void look();
    return () => {
      stopped = true;
      window.clearTimeout(timer);
    };
  }
  const { BrowserMultiFormatReader } = await import('@zxing/browser');
  const controls = await new BrowserMultiFormatReader().decodeFromVideoElement(video, (result) => {
    if (result) onCode(result.getText());
  });
  return () => {
    controls.stop();
  };
}
