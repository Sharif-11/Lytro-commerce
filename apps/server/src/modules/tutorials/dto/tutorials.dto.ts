import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import {
  TUTORIAL_KEYS,
  TutorialScreen,
  dateField,
  tutorialDismissSchema,
  tutorialPlaylistSchema,
  tutorialPublishSchema,
  tutorialUploadStartSchema,
} from '@lytronix/validators';

// TENANT-DASHBOARD-DESIGN §7.49, OPERATOR-CONSOLE-DESIGN §10h: the tutorials' request and answer shapes. The answers name
// only the parts and screens this release knows: the services leave out a key or screen a later release wrote.
export class TutorialDismissDto extends createZodDto(tutorialDismissSchema) {}
export class TutorialUploadStartDto extends createZodDto(tutorialUploadStartSchema) {}
export class TutorialPublishDto extends createZodDto(tutorialPublishSchema) {}
export class TutorialPlaylistDto extends createZodDto(tutorialPlaylistSchema) {}

const videoSchema = z.object({
  url: z.string(),
  coverUrl: z.string(),
  durationSeconds: z.number().int(),
  version: z.number().int(),
});

export class TutorialsViewDto extends createZodDto(
  z.object({
    parts: z.array(
      z.object({
        key: z.enum(TUTORIAL_KEYS),
        video: videoSchema.nullable(),
        watched: z.boolean(),
      }),
    ),
    dismissed: z.array(z.enum(TutorialScreen)),
    playlistUrl: z.string().nullable(),
  }),
) {}

const operatorRowSchema = z.object({
  key: z.enum(TUTORIAL_KEYS),
  video: videoSchema
    .extend({
      file: z.string(),
      bytes: z.number().int(),
      width: z.number().int(),
      height: z.number().int(),
      uploadedAt: z.string(),
    })
    .nullable(),
  nextFile: z.string(),
});

export class OperatorTutorialDto extends createZodDto(operatorRowSchema) {}

export class OperatorTutorialsDto extends createZodDto(
  z.object({ parts: z.array(operatorRowSchema), playlistUrl: z.string().nullable() }),
) {}

export class TutorialPlaylistViewDto extends createZodDto(
  z.object({ playlistUrl: z.string().nullable() }),
) {}

export class TutorialUploadDto extends createZodDto(
  z.object({
    uploadKey: z.string(),
    upload: z.object({
      url: z.string(),
      method: z.literal('PUT'),
      headers: z.record(z.string(), z.string()),
      expiresAt: dateField(),
    }),
  }),
) {}

export class TutorialOkDto extends createZodDto(z.object({ ok: z.literal(true) })) {}
