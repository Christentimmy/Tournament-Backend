import { Request, Response, NextFunction } from 'express';
import mongoose from 'mongoose';

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  // Someone else saved this tournament after we loaded it
  if (err instanceof mongoose.Error.VersionError) {
    return res.status(409).json({ message: 'Tournament was modified by someone else. Refresh and try again.' });
  }
  if (err instanceof mongoose.Error.CastError || err instanceof mongoose.Error.ValidationError) {
    return res.status(400).json({ message: err.message });
  }

  console.error(err);
  res.status(500).json({ message: 'Internal server error' });
}