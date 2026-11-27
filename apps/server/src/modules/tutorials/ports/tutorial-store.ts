import type {
  InsertTutorialVideo,
  SelectTutorialVideo,
  Transaction,
  TutorialOldFiles,
} from '@lytronix/db';
import type { TutorialScreen } from '@lytronix/validators';

/** TENANT-DASHBOARD-DESIGN §7.49, OPERATOR-CONSOLE-DESIGN §10h: the tutorials' rows, Lytro's and each shop person's. */
export interface TutorialStore {
  /** Lytro's own rows (no shop context). */
  run<T>(work: (tx: Transaction) => Promise<T>): Promise<T>;
  /** A shop's rows, under row-level security for that shop. */
  inShop<T>(tenantId: string, work: (tx: Transaction) => Promise<T>): Promise<T>;

  live(): Promise<SelectTutorialVideo[]>;
  nextVersions(): Promise<Map<string, number>>;
  lockPart(tx: Transaction, tutorialKey: string): Promise<void>;
  liveOf(tx: Transaction, tutorialKey: string): Promise<SelectTutorialVideo | null>;
  /** The upload's version, claimed (one past the part's every version) with the file names it makes. */
  claim(
    tx: Transaction,
    row: Omit<InsertTutorialVideo, 'version' | 'videoKey' | 'coverKey'>,
    keysOf: (version: number) => { videoKey: string; coverKey: string },
  ): Promise<SelectTutorialVideo>;
  publish(tx: Transaction, id: string, at: Date): Promise<void>;
  retire(tx: Transaction, id: string, at: Date, by: string | null): Promise<void>;
  retireUnfinished(tx: Transaction, before: Date, at: Date): Promise<number>;
  oldFiles(before: Date, limit: number): Promise<TutorialOldFiles[]>;
  markFilesDeleted(tx: Transaction, ids: readonly string[], at: Date): Promise<void>;

  /** The shop's owner's own row, the person an owner's session acts as. */
  ownerUserId(tx: Transaction, tenantId: string): Promise<string | null>;
  watched(tx: Transaction, tenantId: string, userId: string): Promise<string[]>;
  markWatched(
    tx: Transaction,
    tenantId: string,
    userId: string,
    tutorialKey: string,
  ): Promise<void>;
  dismissed(tx: Transaction, tenantId: string, userId: string): Promise<TutorialScreen[]>;
  dismiss(tx: Transaction, tenantId: string, userId: string, screen: TutorialScreen): Promise<void>;
  hasOrder(tx: Transaction, tenantId: string): Promise<boolean>;
}
