import { Prisma } from '@prisma/client';
import { logger } from './logger';

// Retries a DB operation once when the failure looks like a dead/closed
// connection (Neon free-tier scale-to-zero kills the socket Prisma is
// holding; the next query on it fails, but a fresh connection works fine).
//
// Only ever call this around a whole operation that has NOT told the
// caller it succeeded yet — e.g. the full `prisma.$transaction(...)` call,
// not a query inside it. Retrying a query mid-transaction is meaningless
// (the transaction already aborted); retrying the whole transaction is
// safe because Postgres transactions are atomic — if the connection died
// before COMMIT was acknowledged, the transaction never committed, so
// re-running it from scratch cannot double-apply the write.
//
// Residual risk (not solved here): if the connection dies in the narrow
// window AFTER the server processes COMMIT but BEFORE the client receives
// the ack, the client cannot tell "committed, ack lost" apart from "never
// committed" — retrying in that case would re-run an already-committed
// write. This window is small and unavoidable without per-request
// idempotency keys, which is out of scope for this fix. If it turns out to
// matter in practice, that's the next place to look.
export async function withRetry<T>(fn: () => Promise<T>, label: string): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    logDbError(err, label, 0);

    if (!isRetryableConnectionError(err)) throw err;

    try {
      return await fn();
    } catch (err2) {
      logDbError(err2, label, 1);
      throw err2;
    }
  }
}

// Allowlist, not a message/keyword match — we don't yet know the exact
// shape `kind: Closed` surfaces as in this Prisma version, so matching on
// error.message text risks silently no-op'ing the retry on a wording we
// didn't anticipate. Instead we retry only for Prisma's own
// connection/engine-level error classes, and never for classes that mean
// "the DB understood your query and rejected it" (those are real bugs or
// real constraint violations, retrying them is never correct).
function isRetryableConnectionError(err: unknown): boolean {
  if (err instanceof Prisma.PrismaClientKnownRequestError) return false; // e.g. P2002/P2025 — real DB error, has a meaningful .code
  if (err instanceof Prisma.PrismaClientValidationError) return false; // bad args — a code bug, not transient
  if (err instanceof Prisma.PrismaClientRustPanicError) return false; // engine crashed — retrying won't help, process needs attention

  if (err instanceof Prisma.PrismaClientUnknownRequestError) return true; // uncategorized engine/connection error — where `Closed` most likely lands
  if (err instanceof Prisma.PrismaClientInitializationError) return true; // couldn't (re)establish a connection — plausible right after Neon resumes from suspend

  return false; // not a recognized Prisma error class — fail loud rather than guess
}

// Logged unconditionally (retried or not) so the next real occurrence in
// production shows us the true error shape (name/code/message) — until
// then isRetryableConnectionError() above is a best-effort allowlist, not
// a confirmed match on the actual `kind: Closed` error.
function logDbError(err: unknown, label: string, attempt: number): void {
  const e = err as { name?: string; code?: string; message?: string; constructor?: { name?: string } };
  logger.error('db-retry: operation failed', {
    label,
    attempt,
    name: e?.name,
    code: e?.code,
    message: e?.message,
    className: e?.constructor?.name,
  });
}
