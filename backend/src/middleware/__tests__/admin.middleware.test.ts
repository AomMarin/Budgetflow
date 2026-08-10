import { describe, expect, it, vi } from 'vitest';
import { Response } from 'express';
import { requireAdmin } from '../admin.middleware';
import { AuthenticatedRequest } from '../../types';

// requireAdmin only ever reads req.user.role (already attached by the
// authenticate middleware from the JWT payload) — no DB access, so this
// is a pure unit test with mocked req/res. This is the exact rule that
// keeps a USER-role account (e.g. the public demo user) locked out of
// /admin/*, regardless of what's seeded in any database.
function mockRes(): Response {
  const res = {} as Response;
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

function mockReq(role: 'USER' | 'ADMIN'): AuthenticatedRequest {
  return { user: { id: 'u1', email: 'x@x.com', name: 'X', role } } as AuthenticatedRequest;
}

describe('requireAdmin', () => {
  it('blocks a USER-role request with 403 and does not call next()', () => {
    const req = mockReq('USER');
    const res = mockRes();
    const next = vi.fn();

    requireAdmin(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('allows an ADMIN-role request through to next()', () => {
    const req = mockReq('ADMIN');
    const res = mockRes();
    const next = vi.fn();

    requireAdmin(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(res.status).not.toHaveBeenCalled();
  });
});
