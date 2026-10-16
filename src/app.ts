import express, { type Express, type Request, type Response } from 'express'

export function createApp(): Express {
  const app = express()

  app.get('/health', (_req: Request, res: Response) => {
    res.json({ status: 'ok', uptime: process.uptime() })
  })

  return app
}
