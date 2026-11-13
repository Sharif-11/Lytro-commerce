// The services Lytro works with today, as the integration strip and the phone menu show them: official marks only, each
// in its own colours on a white tile (BRAND-IDENTITY.md §8.7). Only live services appear; RedX joins when its
// integration ships (docs/brand/third-party/README.md).
export interface LiveService {
  name: string;
  src: string;
  width: number;
  height: number;
}

export const liveServices: readonly LiveService[] = [
  { name: 'bKash', src: '/third-party/bkash.png', width: 96, height: 40 },
  { name: 'Nagad', src: '/third-party/nagad.png', width: 96, height: 40 },
  { name: 'Pathao', src: '/third-party/pathao.svg', width: 100, height: 36 },
  { name: 'Steadfast', src: '/third-party/steadfast.svg', width: 120, height: 36 },
];
