import type { NextFunction, Request, Response } from 'express';

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (req.auth?.accessLevel === 1) {
    res.set('Cache-Control', 'no-store');
    next();
    return;
  }
  res.redirect(`/admin/login?next=${encodeURIComponent(req.originalUrl)}`);
}
