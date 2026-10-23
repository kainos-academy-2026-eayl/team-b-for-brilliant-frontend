import type { NextFunction, Request, Response } from 'express';

export async function requireAdmin(req: Request, res: Response, next: NextFunction): Promise<void> {
  const apiBase = process.env.API_BASE_URL ?? '';

  try {
    const response = await fetch(`${apiBase}/api/v1/auth/admin/me`, {
      headers: { cookie: req.headers.cookie ?? '' },
    });

    if (response.ok) {
      res.set('Cache-Control', 'no-store');
      next();
      return;
    }
  } catch {
    // Backend unreachable: treat as signed out
  }

  res.redirect(`/admin/login?next=${encodeURIComponent(req.originalUrl)}`);
}
