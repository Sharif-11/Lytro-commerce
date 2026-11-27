import { sql } from 'drizzle-orm';
import { index, integer, text, timestamp, unique, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { control } from '../shared';

// TENANT-DASHBOARD-DESIGN §7.49 and OPERATOR-CONSOLE-DESIGN §10h (the owner, 2026-11-27): the file behind each tutorial of
// the series (whose names, order and screens are in code, @lytronix/validators' TUTORIAL_SERIES). One row per uploaded
// version, Lytro's own and platform-wide: a part's live file is its one row published and not retired, and a part with
// none has no video. An upload first claims its version (a row not yet published), so two uploads never write the same
// file name, and only then sends its files; no transaction waits on the store. Replaced and removed versions stay, so the
// next upload's name always moves on (media.lytro.app caches a file a year under its name) and the nightly job knows
// which old files to delete once their 7 days pass.
export const tutorialVideos = control.table(
  'tutorial_videos',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    // The part's key in the series, e.g. 03-add-product; a code change adds one, so it is not a database enum.
    tutorialKey: text('tutorial_key').notNull(),
    version: integer('version').notNull(),
    // platform/tutorials/<key>-v<N>.mp4 and .jpg in the public media bucket, outside every shop's prefix.
    videoKey: text('video_key').notNull(),
    coverKey: text('cover_key').notNull(),
    // Read from the file itself when it was uploaded, never typed.
    durationSeconds: integer('duration_seconds').notNull(),
    bytes: integer('bytes').notNull(),
    width: integer('width').notNull(),
    height: integer('height').notNull(),
    uploadedBy: uuid('uploaded_by').notNull(), // operator account id
    uploadedAt: timestamp('uploaded_at', { withTimezone: true }).notNull().defaultNow(),
    // Set once its files are stored: from then until it is retired, it is the part's live file.
    publishedAt: timestamp('published_at', { withTimezone: true }),
    // Replaced by the next version, removed, or an upload that never finished; its files are deleted
    // TUTORIAL_OLD_FILE_DAYS later.
    retiredAt: timestamp('retired_at', { withTimezone: true }),
    retiredBy: uuid('retired_by'),
    filesDeletedAt: timestamp('files_deleted_at', { withTimezone: true }),
  },
  (t) => [
    unique('tutorial_videos_version_key').on(t.tutorialKey, t.version),
    uniqueIndex('tutorial_videos_live_idx')
      .on(t.tutorialKey)
      .where(sql`${t.publishedAt} IS NOT NULL AND ${t.retiredAt} IS NULL`),
    index('tutorial_videos_old_files_idx')
      .on(t.retiredAt)
      .where(sql`${t.retiredAt} IS NOT NULL AND ${t.filesDeletedAt} IS NULL`),
  ],
);

export type SelectTutorialVideo = typeof tutorialVideos.$inferSelect;
export type InsertTutorialVideo = typeof tutorialVideos.$inferInsert;
