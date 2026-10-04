// Which of a batch of candidate slugs are held by a shop or reserved. Implemented over the database.
export interface SlugAvailability {
  findUnavailable(slugs: string[]): Promise<Set<string>>;
}
