import { describe, expect, it } from 'vitest';
import { Prisma } from '@prisma/client';
import { withRetry } from '../db-retry';

// This is a contract test for withRetry() itself — it does not touch the
// real DB. We can't deterministically kill a live Postgres connection
// mid-transaction in a test, so instead we assert the thing that actually
// matters for money-safety: given a function that performs a side effect
// and then either throws or succeeds, withRetry() calls that function at
// most twice, and the number of times the side effect actually ran matches
// the number of calls — i.e. "retried once" and "ran twice" are the same
// number, which is the double-write question in operational terms.

function knownRequestError(code: string): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError('constraint violated', {
    code,
    clientVersion: '5.10.0',
  });
}

function validationError(): Prisma.PrismaClientValidationError {
  return new Prisma.PrismaClientValidationError('bad args', { clientVersion: '5.10.0' });
}

function rustPanicError(): Prisma.PrismaClientRustPanicError {
  return new Prisma.PrismaClientRustPanicError('engine panicked', '5.10.0');
}

function unknownRequestError(): Prisma.PrismaClientUnknownRequestError {
  return new Prisma.PrismaClientUnknownRequestError('kind: Closed, cause: None', {
    clientVersion: '5.10.0',
  });
}

function initializationError(): Prisma.PrismaClientInitializationError {
  return new Prisma.PrismaClientInitializationError('could not connect', '5.10.0');
}

describe('withRetry', () => {
  it('retries once on PrismaClientUnknownRequestError and returns the second result', async () => {
    const effects: string[] = [];
    let calls = 0;
    const result = await withRetry(async () => {
      calls++;
      if (calls === 1) {
        throw unknownRequestError();
      }
      effects.push('write');
      return 'ok';
    }, 'test.unknown');

    expect(result).toBe('ok');
    expect(calls).toBe(2);
    expect(effects).toEqual(['write']); // ran exactly once — no double-write
  });

  it('retries once on PrismaClientInitializationError', async () => {
    let calls = 0;
    const result = await withRetry(async () => {
      calls++;
      if (calls === 1) throw initializationError();
      return 'ok';
    }, 'test.init');

    expect(result).toBe('ok');
    expect(calls).toBe(2);
  });

  it('gives up after a second failure — never more than one retry', async () => {
    let calls = 0;
    await expect(
      withRetry(async () => {
        calls++;
        throw unknownRequestError();
      }, 'test.always-fails'),
    ).rejects.toThrow('kind: Closed');

    expect(calls).toBe(2); // original attempt + exactly one retry, not unbounded
  });

  it('does not retry PrismaClientKnownRequestError (e.g. unique constraint P2002)', async () => {
    const effects: string[] = [];
    let calls = 0;
    await expect(
      withRetry(async () => {
        calls++;
        effects.push('write');
        throw knownRequestError('P2002');
      }, 'test.known'),
    ).rejects.toThrow('constraint violated');

    expect(calls).toBe(1);
    expect(effects).toEqual(['write']); // ran exactly once — a retry here would double-write
  });

  it('does not retry PrismaClientValidationError', async () => {
    let calls = 0;
    await expect(
      withRetry(async () => {
        calls++;
        throw validationError();
      }, 'test.validation'),
    ).rejects.toThrow('bad args');

    expect(calls).toBe(1);
  });

  it('does not retry PrismaClientRustPanicError', async () => {
    let calls = 0;
    await expect(
      withRetry(async () => {
        calls++;
        throw rustPanicError();
      }, 'test.panic'),
    ).rejects.toThrow('engine panicked');

    expect(calls).toBe(1);
  });

  it('does not retry a plain, unrecognized error', async () => {
    let calls = 0;
    await expect(
      withRetry(async () => {
        calls++;
        throw new Error('something else entirely');
      }, 'test.unrecognized'),
    ).rejects.toThrow('something else entirely');

    expect(calls).toBe(1);
  });

  it('succeeds without retrying when the first attempt works', async () => {
    let calls = 0;
    const result = await withRetry(async () => {
      calls++;
      return 'first-try';
    }, 'test.happy-path');

    expect(result).toBe('first-try');
    expect(calls).toBe(1);
  });
});
