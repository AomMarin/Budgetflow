import { PrismaClient } from '@prisma/client';
import { env } from './env';
import { withRetry } from '../utils/db-retry';

// Cache the *base* (un-extended) client across dev hot-reloads, not the
// extended one below — keeps this the single place a new PrismaClient gets
// constructed, same as before $extends was introduced.
const globalForPrisma = globalThis as unknown as {
  prismaBase: PrismaClient | undefined;
};

const prismaBase =
  globalForPrisma.prismaBase ??
  new PrismaClient({
    log: env.isDevelopment ? ['query', 'error', 'warn'] : ['error'],
  });

if (env.isDevelopment) globalForPrisma.prismaBase = prismaBase;

// Reads only, once. This is separate from — and safe to nest under —
// withRetry() wrapping a whole prisma.$transaction() call at the service
// layer (see db-retry.ts): a read inside an already-broken interactive
// transaction has nothing to double-write (it's a read), so a wasted extra
// attempt here just fails fast and lets the outer transaction-level retry
// take over. Bounded either way — this extension retries at most once,
// same as withRetry, so nesting cannot compound into repeated/unbounded
// retries.
const READ_OPERATIONS = new Set([
  'findFirst',
  'findFirstOrThrow',
  'findUnique',
  'findUniqueOrThrow',
  'findMany',
  'count',
  'aggregate',
  'groupBy',
]);

// Cast back to PrismaClient: $extends() returns a DynamicClientExtensionThis
// type that isn't structurally assignable to Prisma.TransactionClient, which
// every repository in this codebase uses as a parameter type (`tx:
// Prisma.TransactionClient | typeof prisma`). We aren't adding any new
// model/client methods here, only wrapping query execution, so nothing is
// actually lost at runtime — this keeps the extension local to this file
// instead of forcing a type change through every repository signature.
export const prisma = prismaBase.$extends({
  name: 'read-retry',
  query: {
    $allModels: {
      async $allOperations({ model, operation, args, query }) {
        if (!READ_OPERATIONS.has(operation)) return query(args);
        return withRetry(() => query(args), `read:${model}.${operation}`);
      },
    },
  },
}) as unknown as PrismaClient;

export async function connectDatabase(): Promise<void> {
  await prismaBase.$connect();
  console.log('✅ Database connected');
}

export async function disconnectDatabase(): Promise<void> {
  await prismaBase.$disconnect();
}
