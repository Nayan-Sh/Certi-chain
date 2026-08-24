const jwt = require('jsonwebtoken');

// ── authMiddleware ─────────────────────────────────────────────────────────
// Verifies the `Authorization: Bearer <token>` header, decodes the JWT and
// attaches `req.user = { id, email, role, ... }`. Chain this BEFORE any
// route that needs a logged-in user.
const authMiddleware = (req, res, next) => {
  console.log('[DEBUG authMiddleware] path:', req.path, 'method:', req.method);
  const authHeader = req.header('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided. Authorization denied.' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded; // { id, email, role, iat, exp }
    console.log('[DEBUG authMiddleware] user:', req.user);
    next();
  } catch (err) {
    console.log('[DEBUG authMiddleware] error:', err.message);
    res.status(401).json({ error: 'Invalid or expired token.' });
  }
};

// ── requireRole ────────────────────────────────────────────────────────────
// Role-Based Access Control. Must run AFTER authMiddleware (so req.user exists).
// Rejects the request with 403 unless the authenticated user's role is one of
// the allowed roles — e.g. requireRole('admin') or requireRole('admin','student').
const requireRole = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authenticate first.' });
    }
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        error: `Access denied. Requires role: ${allowedRoles.join(' or ')}.`,
      });
    }
    next();
  };
};

module.exports = authMiddleware;
module.exports.requireRole = requireRole;