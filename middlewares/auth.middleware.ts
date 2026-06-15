import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

// ---------------------------------------------------------------------------
// Type Augmentation — extend Express Request with an optional `user` payload
// ---------------------------------------------------------------------------
declare global {
  namespace Express {
    interface Request {
      user?: {
        userId: string;
        role: string;
      };
    }
  }
}

interface JwtPayload {
  userId: string;
  role: string;
}

// ---------------------------------------------------------------------------
// authenticate — Verify Bearer JWT; attach decoded payload to req.user
// ---------------------------------------------------------------------------
export const authenticate = (req: Request, res: Response, next: NextFunction): void => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ success: false, message: 'No token provided. Authorization denied.' });
    return;
  }

  const token = authHeader.split(' ')[1];

  try {
    const secret = process.env.JWT_SECRET;
    if (!secret) {
      throw new Error('JWT_SECRET is not configured on the server.');
    }

    const decoded = jwt.verify(token, secret) as JwtPayload;
    req.user = { userId: decoded.userId, role: decoded.role };
    next();
  } catch (err) {
    const message =
      err instanceof jwt.TokenExpiredError
        ? 'Token has expired. Please log in again.'
        : 'Invalid or malformed token.';

    res.status(401).json({ success: false, message });
  }
};

// ---------------------------------------------------------------------------
// authorizeRole — Factory middleware; checks req.user.role against allowed list
// ---------------------------------------------------------------------------
export const authorizeRole = (...allowedRoles: string[]) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ success: false, message: 'Not authenticated.' });
      return;
    }

    if (!allowedRoles.includes(req.user.role)) {
      res.status(403).json({
        success: false,
        message: `Access denied. This route requires one of these roles: [${allowedRoles.join(', ')}].`
      });
      return;
    }

    next();
  };
};
