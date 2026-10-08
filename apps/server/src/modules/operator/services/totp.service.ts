import { Injectable } from '@nestjs/common';
import { generateSecret, generateURI, verify } from 'otplib';

// ADM-01: TOTP (RFC 6238). One time-step of drift tolerance either side (±30s), the standard allowance for
// clock skew between the operator's device and this server — otplib's own default is 0 (strict).
const EPOCH_TOLERANCE_SECONDS = 30;
const ISSUER = 'Lytronix';

/** Generates and checks TOTP secrets and codes. Pure wrapping of otplib — no state of its own. */
@Injectable()
export class TotpService {
  generateSecret(): string {
    return generateSecret();
  }

  /** The otpauth:// URI an authenticator app turns into a QR code (ADM-01: shown once, alongside the secret). */
  uriFor(secret: string, email: string): string {
    return generateURI({ issuer: ISSUER, label: email, secret });
  }

  async verifyCode(secret: string, code: string): Promise<boolean> {
    const result = await verify({ secret, token: code, epochTolerance: EPOCH_TOLERANCE_SECONDS });
    return result.valid;
  }
}
