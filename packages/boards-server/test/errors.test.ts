import { describe, expect, it } from 'bun:test';
import { Hono } from 'hono';
import { BoardsError } from '@saliagadotcom/boards-core';
import type { ErrorCode } from '@saliagadotcom/boards-core';
import { errorHandler, HTTP_STATUS } from '../src/errors.js';

describe('HTTP_STATUS', () => {
  const expected: Record<ErrorCode, number> = {
    invalid_request: 400,
    invalid_transition: 400,
    not_found: 404,
    conflict: 409,
    self_dependency: 400,
    circular_dependency: 400,
    cross_board: 400,
    internal_error: 500,
  };

  for (const [code, status] of Object.entries(expected)) {
    it(`maps ${code} to ${status}`, () => {
      expect(HTTP_STATUS[code as ErrorCode]).toBe(status);
    });
  }
});

function createTestApp() {
  const app = new Hono();
  app.onError(errorHandler);

  app.get('/boards-error/:code', (c) => {
    const code = c.req.param('code') as ErrorCode;
    throw new BoardsError(code, `${code} happened`);
  });

  app.get('/generic-error', () => {
    throw new Error('something broke');
  });

  return app;
}

describe('errorHandler', () => {
  const app = createTestApp();

  describe('BoardsError responses', () => {
    for (const [code, status] of Object.entries(HTTP_STATUS)) {
      it(`returns ${status} for ${code}`, async () => {
        const res = await app.request(`/boards-error/${code}`);
        expect(res.status).toBe(status);
        const body = await res.json();
        expect(body).toEqual({
          error: { code, message: `${code} happened` },
        });
      });
    }

    it('sets content-type to application/json', async () => {
      const res = await app.request('/boards-error/not_found');
      expect(res.headers.get('content-type')).toContain('application/json');
    });
  });

  describe('non-BoardsError', () => {
    it('returns 500 with generic message (no internal details)', async () => {
      const res = await app.request('/generic-error');
      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body).toEqual({
        error: { code: 'internal_error', message: 'Internal server error' },
      });
    });

    it('sets content-type to application/json', async () => {
      const res = await app.request('/generic-error');
      expect(res.headers.get('content-type')).toContain('application/json');
    });
  });
});
