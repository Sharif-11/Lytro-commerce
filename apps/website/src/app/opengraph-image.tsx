import { ImageResponse } from 'next/og';

// The link preview (BRAND-IDENTITY.md §8.6): teal field, the mark as the L of the wordmark, the Bangla
// claim. Drawn at request time so it needs no exported PNG in the repository.
export const alt = 'Lytro — আপনার দোকান, আপনার হাতে';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function OpenGraphImage() {
  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding: 72,
        background: 'linear-gradient(135deg, #063b38 0%, #0a4f4b 60%, #0e6b66 100%)',
        color: '#ffffff',
        fontFamily: 'sans-serif',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <svg viewBox="0 0 64 64" width={96} height={96}>
          <path
            d="M15 15V49H31L49 29"
            fill="none"
            stroke="#ffffff"
            strokeWidth={10}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <span style={{ fontSize: 84, fontWeight: 800, letterSpacing: -4, marginLeft: -14 }}>
          ytro
        </span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        <span style={{ fontSize: 60, fontWeight: 800, lineHeight: 1.2 }}>
          আপনার দোকান, আপনার হাতে।
        </span>
        <span style={{ fontSize: 30, color: 'rgba(255,255,255,0.85)' }}>
          অর্ডার · বিকাশ-নগদ পেমেন্ট · কুরিয়ার · ফেক অর্ডার চেক · বাংলায়
        </span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, fontSize: 26 }}>
        <span style={{ width: 14, height: 14, borderRadius: 7, background: '#f2a516' }} />
        <span>lytro.app · ৩০ দিন ফ্রি, কার্ড লাগে না</span>
      </div>
    </div>,
    size,
  );
}
