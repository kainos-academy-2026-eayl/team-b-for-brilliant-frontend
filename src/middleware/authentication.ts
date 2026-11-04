import type { Request, RequestHandler, Response } from 'express';
import type { TokenClient } from '../clients/tokenClient';
import {
  cookieOptions,
  newBrowserState,
  readCookie,
  saveBrowserState,
} from './browserState';

export const AUTH_COOKIE = 'access_token';

export function clearAuthentication(req: Request, res: Response): void {
  delete req.auth;
  res.clearCookie(AUTH_COOKIE, cookieOptions());
  req.browserState = newBrowserState();
  saveBrowserState(req, res);
}

export async function signIn(
  req: Request,
  res: Response,
  accessToken: string,
  customerId?: string,
  adminOnly = false,
): Promise<void> {
  const identity = await req.tokenClient.getIdentity(accessToken);
  if (!identity || (customerId && identity.customerId !== customerId)
    || (adminOnly && identity.accessLevel !== 1)) {
    throw new Error('Backend returned an invalid access token or identity');
  }
  req.auth = { ...identity, accessToken };
  req.browserState = newBrowserState();
  saveBrowserState(req, res);
  res.cookie(AUTH_COOKIE, accessToken, cookieOptions());
}

export async function signOut(req: Request, res: Response): Promise<void> {
  const token = req.auth?.accessToken;
  clearAuthentication(req, res);
  if (token) await req.tokenClient.logout(token);
}

export function createAuthentication(client: TokenClient): RequestHandler {
  return async (req, res, next) => {
    req.tokenClient = client;
    const token = readCookie(req, AUTH_COOKIE);
    res.set('Cache-Control', 'no-store');
    if (token) {
      try {
        const identity = await client.getIdentity(token);
        if (identity) req.auth = { ...identity, accessToken: token };
        else clearAuthentication(req, res);
      } catch (error) {
        console.error('Token validation failed', error);
        const loggingOut = req.method === 'POST'
          && (req.path === '/logout' || req.path === '/admin/account/logout');
        if (loggingOut) clearAuthentication(req, res);
        res.status(503).render('error', {
          message: loggingOut
            ? 'You have been signed out in this browser, but we could not revoke your token. Please try again later.'
            : 'We could not verify your sign-in right now. Please try again later.',
        });
        return;
      }
    }
    next();
  };
}
