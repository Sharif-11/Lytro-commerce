// The landing page's rule: never claim what is not live (docs/LANDING-PAGE-DESIGN.md §2, §7). Sections that
// describe Phase 3/4 features render only when the deployment says those features exist.
export type LiveFeature = 'inventory' | 'statistics' | 'showcase';

export class LiveFeatures {
  constructor(private readonly live: ReadonlySet<string>) {}

  has(feature: LiveFeature): boolean {
    return this.live.has(feature);
  }
}
