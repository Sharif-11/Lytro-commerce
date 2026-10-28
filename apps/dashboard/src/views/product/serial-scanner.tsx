import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Icon } from '@/components/icon';
import { Banner } from '@/components/ui/banner';
import { Button } from '@/components/ui/button';
import { readBarcodes } from '@/lib/barcode-reader';

type Camera = 'starting' | 'live' | 'none' | 'blocked';

/** An accepted scan's green flash, as long as it shows. */
const FLASH_MS = 300;

/**
 * Scan (Part 15's `pf-sh-serials`, `pf-sh-serials-nocamera`, `pf-sh-serials-blocked`; Part 16): the back camera's
 * video, reading codes as they come into view. `onCode` says whether a code was taken: a new one gives a short
 * vibration and a green flash, no sound; one already in the list is ignored. A device with no camera says so and points
 * to the other two ways; a camera the browser blocks says how to allow it, with Try again.
 */
export function SerialScanner({ onCode }: { onCode: (raw: string) => boolean }): React.JSX.Element {
  const { t } = useTranslation('shop');
  const video = useRef<HTMLVideoElement>(null);
  const [camera, setCamera] = useState<Camera>('starting');
  const [flash, setFlash] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const take = useRef(onCode);
  take.current = onCode;

  useEffect(() => {
    // Whether the sheet has closed meanwhile, asked afresh after each await.
    const run = { ended: false };
    const ended = (): boolean => run.ended;
    let stream: MediaStream | null = null;
    let stopReading: (() => void) | null = null;
    let flashing: number | undefined;
    const end = () => {
      stopReading?.();
      for (const track of stream?.getTracks() ?? []) track.stop();
    };
    void (async () => {
      if (!(navigator.mediaDevices as MediaDevices | undefined)?.getUserMedia) {
        setCamera('none');
        return;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' },
          audio: false,
        });
      } catch (error) {
        const name = error instanceof DOMException ? error.name : '';
        setCamera(name === 'NotAllowedError' || name === 'SecurityError' ? 'blocked' : 'none');
        return;
      }
      const element = video.current;
      if (ended() || !element) {
        end();
        return;
      }
      element.srcObject = stream;
      await element.play().catch(() => undefined);
      setCamera('live');
      const stop = await readBarcodes(element, (raw) => {
        if (!take.current(raw)) return;
        // Safari has no vibration; the flash says it alone there.
        (navigator as Partial<Navigator>).vibrate?.(60);
        setFlash(true);
        window.clearTimeout(flashing);
        flashing = window.setTimeout(() => {
          setFlash(false);
        }, FLASH_MS);
      });
      if (ended()) stop();
      else stopReading = stop;
    })();
    return () => {
      run.ended = true;
      window.clearTimeout(flashing);
      end();
    };
  }, [attempt]);

  if (camera === 'none') {
    return (
      <div className="flex items-start gap-2.5 rounded-card border border-line bg-neutral-50 p-4">
        <Icon name="camera" />
        <span className="text-[14px]">{t('noCamera')}</span>
      </div>
    );
  }
  if (camera === 'blocked') {
    return (
      <div className="flex flex-col items-start gap-2">
        <Banner tone="warn">{t('cameraBlocked')}</Banner>
        <Button
          tone="outline"
          size="sm"
          wide
          onClick={() => {
            setCamera('starting');
            setAttempt((count) => count + 1);
          }}
        >
          {t('tryAgain')}
        </Button>
      </div>
    );
  }
  return (
    <div
      className={[
        'relative flex h-[120px] items-center justify-center overflow-hidden rounded-[10px] bg-ink text-[13px] text-white',
        flash ? 'outline-3 outline-offset-0 outline-success' : '',
      ].join(' ')}
    >
      <video
        ref={video}
        muted
        playsInline
        aria-hidden="true"
        className="absolute inset-0 size-full object-cover opacity-70"
      />
      <span className="relative flex items-center gap-2 px-3 text-center">
        <Icon name="scan" />
        {t('scanHint')}
      </span>
    </div>
  );
}
