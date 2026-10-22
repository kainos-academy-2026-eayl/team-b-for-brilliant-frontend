import type { NextFunction, Request, Response } from 'express'

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (req.session.customerId) {
    next()
    return
  }
  res.redirect(`/login?returnTo=${encodeURIComponent(req.originalUrl)}`)
}
