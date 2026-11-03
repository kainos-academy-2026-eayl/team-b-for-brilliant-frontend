import type { NextFunction, Request, Response } from 'express'

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (req.session.customerId) {
    next()
    return
  }
  const returnTo = req.method === 'GET' ? req.originalUrl : '/products';
  res.redirect(`/login?returnTo=${encodeURIComponent(returnTo)}`);
}
