import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // jsdom: the language helpers read localStorage and set <html lang>.
    environment: 'jsdom',
  },
});
