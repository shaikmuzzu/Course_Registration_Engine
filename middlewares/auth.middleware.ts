import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_dev_key_change_in_production';

// ---------------------------------------------------------------------------
// Express Request type augmentation
// ---------------------------------------------------------------------------
declare global {
  namespace Express {
    interface Request {
      user?: { userId: string; role: string };
    }
  }
}

// ---------------------------------------------------------------------------
// authenticate – verify JWT from Authorization: Bearer <token>
// ---------------------------------------------------------------------------
export const authenticate = (req: Request, res: Response, next: NextFunction): any => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, message: 'Access denied. No token provided.' });
  }

  const token = authHeader.split(' ')[1];

  try {
    const payload = jwt.verify(token, JWT_SECRET) as { userId: string; role: string };
    req.user = payload;
    next();
  } catch {
    return res.status(401).json({ success: false, message: 'Invalid or expired token.' });
  }
};

// ---------------------------------------------------------------------------
// authorizeRole – check if req.user.role is in the allowed list
// ---------------------------------------------------------------------------
export const authorizeRole = (...roles: string[]) => {
  return (req: Request, res: Response, next: NextFunction): any => {
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'Authentication required.' });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: `Forbidden. Required role: ${roles.join(' or ')}.`
      });
    }

    next();
  };
};
