import { createHash, randomBytes } from 'node:crypto';
import type { CookieOptions, Request, RequestHandler, Response } from 'express';
import jwt from 'jsonwebtoken';
import { z } from 'zod';

const STATE_COOKIE = 'browser_state';
const developmentSecret = randomBytes(32).toString('hex');
const stateSchema = z.object({
  csrfToken: z.string().regex(/^[a-f0-9]{64}$/),
  pendingRegistrationEmail: z.string().email().optional(),
  registrationTokenHash: z.string().optional(),
  productCreated: z.boolean().optional(),
});

export type BrowserState = z.infer<typeof stateSchema>;

export function cookieOptions(): CookieOptions {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
  };
}

export function readCookie(req: Request, name: string): string | undefined {
  const cookies = (req.headers.cookie ?? '').split(';');
  const matches = cookies.filter((cookie) => cookie.trim().startsWith(`${name}=`));
  if (matches.length !== 1) return undefined;
  const value = matches[0]?.trim().slice(name.length + 1);
  if (!value) return undefined;
  try {
    return decodeURIComponent(value);
  } catch (error) {
    if (!(error instanceof URIError)) throw error;
    return undefined;
  }
}

export function newBrowserState(): BrowserState {
  return { csrfToken: randomBytes(32).toString('hex') };
}

export function tokenHash(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function saveBrowserState(req: Request, res: Response): void {
  const token = jwt.sign(req.browserState, req.browserStateSecret, {
    algorithm: 'HS256',
    issuer: 'brilliant-frontend',
    audience: 'browser-state',
    expiresIn: '2h',
  });
  res.cookie(STATE_COOKIE, token, cookieOptions());
  res.locals.csrfToken = req.browserState.csrfToken;
}

export function createBrowserState(): RequestHandler {
  const secret = process.env.COOKIE_SECRET ?? developmentSecret;
  if (process.env.NODE_ENV === 'production' && Buffer.byteLength(secret) < 32) {
    throw new Error('COOKIE_SECRET must contain at least 32 bytes');
  }
  if (process.env.NODE_ENV === 'production' && !process.env.COOKIE_SECRET) {
    throw new Error('COOKIE_SECRET is required in production');
  }

  return (req, res, next) => {
    if (readCookie(req, 'connect.sid')) {
      res.clearCookie('connect.sid', cookieOptions());
    }
    req.browserStateSecret = secret;
    req.browserState = newBrowserState();
    const cookie = readCookie(req, STATE_COOKIE);
    if (cookie) {
      try {
        const payload = jwt.verify(cookie, secret, {
          algorithms: ['HS256'],
          issuer: 'brilliant-frontend',
          audience: 'browser-state',
        });
        const parsed = stateSchema.safeParse(payload);
        if (parsed.success) {
          req.browserState = parsed.data;
          next();
          return;
        }
      } catch (error) {
        if (!(error instanceof jwt.JsonWebTokenError)) throw error;
      }
    }
    saveBrowserState(req, res);
    next();
  };
}
