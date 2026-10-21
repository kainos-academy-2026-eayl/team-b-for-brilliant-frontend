import type { Request, Response } from 'express'

export function showHome(_req: Request, res: Response): void {
  res.render('pages/home')
}
