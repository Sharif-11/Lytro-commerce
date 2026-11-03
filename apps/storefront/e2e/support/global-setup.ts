import { startMockServer } from './mock-server';

/** The mocked server lives for the whole run; each test names its own shop in it. */
export default async function globalSetup(): Promise<() => Promise<void>> {
  const server = await startMockServer();
  return () =>
    new Promise((resolve) => {
      server.close(() => {
        resolve();
      });
      server.closeAllConnections();
    });
}
