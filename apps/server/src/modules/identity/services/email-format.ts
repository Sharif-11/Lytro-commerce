import { Injectable } from '@nestjs/common';
import { emailField } from '@lytronix/validators';

/** Normalises an email address (trimmed, lowercase) and checks its form (AUTH-08). */
@Injectable()
export class EmailFormat {
  normalize(raw: string): string | null {
    const parsed = emailField.safeParse(raw);
    return parsed.success ? parsed.data.toLowerCase() : null;
  }
}
