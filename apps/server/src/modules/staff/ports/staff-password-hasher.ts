/** Hashes a staff password for storage. The same hashing rules as the owner's password. */
export interface StaffPasswordHasher {
  hash(password: string): Promise<string>;
}
