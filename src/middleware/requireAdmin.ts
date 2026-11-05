import type { NextFunction, Request, Response } from 'express';

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (req.auth?.accessLevel === 1) {
    res.set('Cache-Control', 'no-store');
    next();
    return;
  }
  res.redirect('/home');
}

export function requireAdminRole(req: Request, res: Response, next: NextFunction) {
  if (!req.auth) {
    res.redirect(`/login?returnTo=${encodeURIComponent(req.originalUrl)}`);
    return;
  }
  if (req.auth.accessLevel !== 1) {
    res.status(403).render('error', { message: 'You do not have permission to view this page.' });
    return;
  }
  res.set('Cache-Control', 'no-store');
  next();
}
