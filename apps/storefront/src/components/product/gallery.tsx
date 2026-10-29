'use client';

import { useRef, useState } from 'react';
import type { PublicProduct } from '@/lib/api/storefront-api';
import type { Words } from '@/lib/i18n/words';
import { Icon } from '../icon';

type Slide =
  | { kind: 'image'; main: string; thumbnail: string }
  | { kind: 'video'; video: string; poster: string };

/** LND-01, PRD-11: the product's photos and its video, as the prototype's gallery lays them out: one large frame with
    dots on a phone (swipe or tap a dot), thumbnails beside it on a wide screen. */
export function Gallery({ product, words }: { product: PublicProduct; words: Words }) {
  const slides: Slide[] = [
    ...product.images.map((image) => ({
      kind: 'image' as const,
      main: image.urls.main,
      thumbnail: image.urls.thumbnail,
    })),
    ...(product.video
      ? [
          {
            kind: 'video' as const,
            video: product.video.urls.video,
            poster: product.video.urls.poster,
          },
        ]
      : []),
  ];
  const [index, setIndex] = useState(0);
  const touchStart = useRef<number | null>(null);
  const current = slides[index];
  const videoIndex = slides.findIndex((slide) => slide.kind === 'video');
  const show = (next: number) => {
    setIndex((next + slides.length) % slides.length);
  };
  const label = (slide: Slide, at: number) =>
    slide.kind === 'video' ? words.t('video') : `${String(at + 1)} / ${String(slides.length)}`;

  return (
    <div className="gal">
      {slides.length > 1 ? (
        <div className="thumbs">
          {slides.map((slide, at) => (
            <button
              key={at}
              type="button"
              aria-label={label(slide, at)}
              aria-pressed={at === index}
              onClick={() => {
                show(at);
              }}
            >
              <i
                className={at === index ? 'on' : undefined}
                style={{
                  backgroundImage: `url("${slide.kind === 'video' ? slide.poster : slide.thumbnail}")`,
                }}
              />
            </button>
          ))}
        </div>
      ) : null}
      <div className="gallery">
        <div
          className="main"
          onTouchStart={(event) => {
            touchStart.current = event.touches[0]?.clientX ?? null;
          }}
          onTouchEnd={(event) => {
            const start = touchStart.current;
            const end = event.changedTouches[0]?.clientX;
            touchStart.current = null;
            if (start === null || end === undefined || slides.length < 2) return;
            if (Math.abs(end - start) < 40) return;
            show(end < start ? index + 1 : index - 1);
          }}
        >
          {current === undefined ? (
            <span className="ph">{Array.from(product.name.trim())[0]}</span>
          ) : current.kind === 'image' ? (
            <img src={current.main} alt={product.name} />
          ) : (
            <video
              src={current.video}
              poster={current.poster}
              controls
              playsInline
              preload="none"
            />
          )}
          {videoIndex >= 0 && current?.kind !== 'video' ? (
            <button
              type="button"
              className="vid"
              onClick={() => {
                show(videoIndex);
              }}
            >
              <Icon name="play" />
              {words.t('video')}
            </button>
          ) : null}
          {slides.length > 1 ? (
            <div className="dots">
              {slides.map((slide, at) => (
                <button
                  key={at}
                  type="button"
                  aria-label={label(slide, at)}
                  onClick={() => {
                    show(at);
                  }}
                >
                  <i className={at === index ? 'on' : undefined} />
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
