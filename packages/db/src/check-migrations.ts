import { execFileSync } from 'node:child_process';
import path from 'node:path';
import {
  FIRST_CHECKED_MIGRATION,
  MIGRATIONS_FOLDER,
  orderProblems,
  readMigrationFiles,
  type MigrationFile,
} from './migration-files';
import { migrationProblems, type PreviousRelease } from './migration-rules';

/** What the check reads from git: a file as a commit had it, and which files differ from it. */
export interface MigrationHistory {
  /** The commit this change started from: what the previous release is taken to be. */
  baseOf(ref: string): string;
  show(commit: string, file: string): string | null;
  /** Files under `folder` changed since `commit`: [status, path] with status A, M or D. */
  changedSince(commit: string, folder: string): [string, string][];
}

/** The repository's git, read-only. */
export class GitHistory implements MigrationHistory {
  constructor(private readonly root: string) {}

  baseOf(ref: string): string {
    return this.git(['merge-base', ref, 'HEAD']).trim();
  }

  show(commit: string, file: string): string | null {
    try {
      return this.git(['show', `${commit}:${file}`]);
    } catch {
      return null;
    }
  }

  changedSince(commit: string, folder: string): [string, string][] {
    return this.git(['diff', '--name-status', '--no-renames', commit, '--', folder])
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        const [status = '', file = ''] = line.split('\t');
        return [status, file];
      });
  }

  private git(args: string[]): string {
    return execFileSync('git', ['-C', this.root, ...args], {
      encoding: 'utf8',
      maxBuffer: 256 * 1024 * 1024,
    });
  }
}

interface Snapshot {
  tables: Record<string, { name: string; schema: string; columns: Record<string, unknown> }>;
}

/**
 * The CI check on migrations (ENGINEERING-STANDARDS §5, Phase 9 Slice 9.7): the journal in order; no migration the
 * base already had changed or removed; and each new one free of what would break the release running beside it or
 * before it, a contract step's drops confirmed gone from the base's schema.
 */
export class MigrationCheck {
  constructor(
    private readonly history: MigrationHistory,
    /** The migrations folder as git names it, from the repository's root. */
    private readonly folder: string,
    private readonly files: readonly MigrationFile[],
  ) {}

  problems(baseRef: string | null): string[] {
    const problems = orderProblems(this.files);
    if (baseRef === null) {
      for (const file of this.files) {
        if (file.number >= FIRST_CHECKED_MIGRATION) problems.push(...migrationProblems(file, null));
      }
      return problems;
    }
    const base = this.history.baseOf(baseRef);
    const journal = this.history.show(base, `${this.folder}/meta/_journal.json`);
    const earlier = journal
      ? (JSON.parse(journal) as { entries: { tag: string; when: number }[] }).entries
      : [];
    earlier.forEach((entry, index) => {
      const now = this.files[index];
      if (now?.tag !== entry.tag || now.when !== entry.when) {
        problems.push(
          `the journal's entry for ${entry.tag} changed or moved: merged entries never change`,
        );
      }
    });
    const tags = new Set(earlier.map((entry) => entry.tag));
    for (const [status, file] of this.history.changedSince(base, this.folder)) {
      const tag = path.posix.basename(file, '.sql');
      if (file.endsWith('.sql') && tags.has(tag) && status !== 'A') {
        problems.push(
          `${tag} was ${status === 'D' ? 'removed' : 'changed'} after it merged: a migration that ran never changes; put the change in a new one`,
        );
      }
    }
    const previous: PreviousRelease = { tags, tables: this.tablesAt(base, earlier.at(-1)?.tag) };
    for (const file of this.files) {
      if (!tags.has(file.tag) && file.number >= FIRST_CHECKED_MIGRATION) {
        problems.push(...migrationProblems(file, previous));
      }
    }
    return problems;
  }

  /** Each table and its columns as the newest snapshot at `commit` has them. */
  private tablesAt(commit: string, tag: string | undefined): Map<string, Set<string>> {
    const text = tag
      ? this.history.show(commit, `${this.folder}/meta/${tag.slice(0, 4)}_snapshot.json`)
      : null;
    const tables = new Map<string, Set<string>>();
    if (!text) return tables;
    for (const table of Object.values((JSON.parse(text) as Snapshot).tables)) {
      tables.set(
        `${table.schema || 'public'}.${table.name}`.toLowerCase(),
        new Set(Object.keys(table.columns).map((column) => column.toLowerCase())),
      );
    }
    return tables;
  }
}

if (require.main === module) {
  const at = process.argv.indexOf('--base');
  const baseRef = at === -1 ? null : (process.argv[at + 1] ?? null);
  const root = execFileSync('git', ['-C', MIGRATIONS_FOLDER, 'rev-parse', '--show-toplevel'], {
    encoding: 'utf8',
  }).trim();
  const folder = path.relative(root, MIGRATIONS_FOLDER).split(path.sep).join('/');
  const problems = new MigrationCheck(new GitHistory(root), folder, readMigrationFiles()).problems(
    baseRef,
  );
  if (problems.length > 0) {
    console.error(`Migration rules (ENGINEERING-STANDARDS §5):\n- ${problems.join('\n- ')}`);
    process.exit(1);
  }
  console.log(`migrations follow the rules${baseRef ? ` (against ${baseRef})` : ''}`);
}
