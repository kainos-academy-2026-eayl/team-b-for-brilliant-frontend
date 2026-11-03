import { timingSafeEqual } from 'node:crypto'
import type { NextFunction, Request, Response } from 'express'

export function csrfProtection(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    const sent = Buffer.from(String(req.body?._csrf ?? ''))
    const expected = Buffer.from(req.browserState.csrfToken)
    if (sent.length !== expected.length || !timingSafeEqual(sent, expected)) {
      res.status(403).send('Invalid CSRF token')
      return
    }
  }
  next()
}
