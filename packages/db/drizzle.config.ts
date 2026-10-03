import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/schema/index.ts',
  out: './drizzle',
  // Migrations are generated SQL, reviewed in source control before they run (DAT-04).
  strict: true,
  verbose: true,
});
