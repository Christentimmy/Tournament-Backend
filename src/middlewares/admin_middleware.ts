import { Request, Response, NextFunction } from 'express';
import { timingSafeEqual } from 'crypto';

/**
 * Protects write routes. Set ADMIN_API_KEY in .env and send it as the
 * `x-admin-key` header from the admin panel.
 */
export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const expected = process.env.ADMIN_API_KEY;
  if (!expected) {
    return res.status(500).json({ message: 'ADMIN_API_KEY is not configured on the server' });
  }

  const provided = String(req.header('x-admin-key') ?? '');
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);

  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return res.status(401).json({ message: 'Unauthorized' });
  }
  next();
}