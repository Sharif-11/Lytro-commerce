import { Inject, Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join } from 'node:path';
import type { PageAssets } from '../page/render';
import { PAY_PAGE_ASSETS_DIR } from '../tokens';

const TYPES: Readonly<Record<string, string>> = {
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
};

export interface PageAsset {
  type: string;
  data: Buffer;
}

/**
 * PAY-23, PAYMENT-PAGE-DESIGN §6: the page's stylesheet, script, fonts and wallet marks, read once at start, so only these
 * files are ever served and the address names nothing on disk. The stylesheet and script are asked for with a hash of
 * their contents, so a new version reaches a phone that keeps the old one for a year.
 */
@Injectable()
export class PaymentPageAssets {
  private readonly files = new Map<string, PageAsset>();
  readonly urls: PageAssets;

  constructor(@Inject(PAY_PAGE_ASSETS_DIR) directory: string) {
    this.load(directory, '');
    this.urls = { css: this.versioned('page.css'), js: this.versioned('page.js') };
  }

  /** A file by its name under the page's assets, or null for anything else. */
  file(name: string): PageAsset | null {
    return this.files.get(name) ?? null;
  }

  private load(directory: string, prefix: string): void {
    for (const entry of readdirSync(directory)) {
      const path = join(directory, entry);
      if (statSync(path).isDirectory()) {
        this.load(path, `${prefix}${entry}/`);
        continue;
      }
      const type = TYPES[extname(entry)];
      if (type !== undefined)
        this.files.set(`${prefix}${entry}`, { type, data: readFileSync(path) });
    }
  }

  private versioned(name: string): string {
    const asset = this.files.get(name);
    if (!asset) throw new Error(`the payment page's assets have no ${name}`);
    const version = createHash('sha256').update(asset.data).digest('hex').slice(0, 12);
    return `/assets/${name}?v=${version}`;
  }
}
