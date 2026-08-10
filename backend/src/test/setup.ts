const url = process.env.DATABASE_URL ?? '';

if (!url.includes('_test')) {
  throw new Error(
    `Refusing to run tests: DATABASE_URL does not look like a test database (${url}). ` +
      `Run tests via "npm run test" (loads .env.test), not vitest directly.`,
  );
}
