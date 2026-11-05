/** A code as typed, with any spaces an authenticator app shows in it taken out. */
export function typedCode(code: string): string {
  return code.replace(/\s/g, '');
}
