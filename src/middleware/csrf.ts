import { randomBytes, timingSafeEqual } from 'node:crypto'
import type { NextFunction, Request, Response } from 'express'

export function csrfProtection(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  req.session.csrfToken ??= randomBytes(32).toString('hex')

  if (req.method === 'POST') {
    const sent = Buffer.from(String(req.body?._csrf ?? ''))
    const expected = Buffer.from(req.session.csrfToken)
    if (sent.length !== expected.length || !timingSafeEqual(sent, expected)) {
      res.status(403).send('Invalid CSRF token')
      return
    }
  }
  next()
}
