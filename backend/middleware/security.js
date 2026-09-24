// ── middleware/security.js ──────────────────────────────────────────────────
// Dependency-free security middleware. Deliberately avoids helmet /
// express-rate-limit / express-mongo-sanitize so the backend gains these
// protections without any new npm install.
//
// Provides:
//   assertConfig()      — fail fast on missing / placeholder / weak secrets
//   securityHeaders     — minimal hardening headers (helmet subset)
//   sanitizeMongo       — strips NoSQL operator injection ($gt, $ne, dotted keys)
//   rateLimit()         — in-memory fixed-window limiter
//   notFound / errorHandler

// ── 1. Startup configuration guards ────────────────────────────────────────
// Values shipped in .env.example / README that must never survive into a real
// deployment. JWT_SECRET was found still set to the committed placeholder
// phrase, which makes every admin JWT forgeable by anyone who has seen the repo.
// Matched as SUBSTRINGS of the normalized secret, not exact values. Exact
// matching is too easy to slip past: the placeholder actually found in this repo
// was 33 characters long (so it cleared any length check) and contained
// underscores (so it dodged a "looks like a dictionary phrase" regex), yet it
// was still the stock value committed to the repo.
const PLACEHOLDER_MARKERS = [
  'changeme',
  'changethis',
  'change-in-production',
  'changeinproduction',
  'replaceme',
  'yoursecret',
  'yourjwtsecret',
  'secretkey',
  'supersecret',
  'mysecret',
  'placeholder',
  'insertyour',
  'todo',
  'example',
  'random',      // a truly random secret does not contain the word "random"
  'longstring',
  'notsecure',
  'devonly',
];

const MIN_SECRET_LENGTH = 32;

function normalizeSecret(value) {
  return String(value).trim().toLowerCase().replace(/[\s_-]+/g, '');
}

function findPlaceholderMarker(normalized) {
  return PLACEHOLDER_MARKERS.find((marker) =>
    normalized.includes(marker.replace(/[\s_-]+/g, ''))
  );
}

function assertConfig({ exitOnFailure = true } = {}) {
  const problems = [];
  const warnings = [];
  const secret = process.env.JWT_SECRET;

  if (!secret) {
    problems.push('JWT_SECRET is not set. Add it to backend/.env.');
  } else {
    const normalized = normalizeSecret(secret);

    // Reject known placeholders, and any value that reads like a stock phrase.
    if (findPlaceholderMarker(normalized)) {
      problems.push(
        'JWT_SECRET is still a placeholder value. Anyone who has seen this repo ' +
        'can forge admin tokens. Generate a real one: openssl rand -base64 48'
      );
    } else if (secret.length < MIN_SECRET_LENGTH) {
      problems.push(
        `JWT_SECRET is only ${secret.length} characters. Use at least ` +
        `${MIN_SECRET_LENGTH}: openssl rand -base64 48`
      );
    } else if (/^[a-z\s]+$/i.test(secret) && secret.split(/\s+/).length <= 8) {
      // A short dictionary phrase (e.g. the committed placeholder sentence) is
      // low entropy even when it clears the length check.
      warnings.push(
        'JWT_SECRET looks like a dictionary phrase rather than random bytes. ' +
        'Prefer: openssl rand -base64 48'
      );
    }
  }

  if (!process.env.MONGO_URI) {
    warnings.push('MONGO_URI not set — falling back to mongodb://127.0.0.1:27017/certificatesDB');
  }

  if (process.env.NODE_ENV === 'production') {
    if (!process.env.CORS_ORIGIN) {
      problems.push('CORS_ORIGIN must be set explicitly in production.');
    }
    if ((process.env.CORS_ORIGIN || '').includes('*')) {
      problems.push('CORS_ORIGIN must not be "*" in production.');
    }
    if (!process.env.ADMIN_EMAILS) {
      warnings.push('ADMIN_EMAILS is empty — no account can self-register as admin.');
    }
  }

  for (const w of warnings) console.warn(`[config] WARNING: ${w}`);

  if (problems.length) {
    console.error('\n[config] Refusing to start — fix these first:');
    for (const p of problems) console.error(`  ✗ ${p}`);
    console.error('');
    if (exitOnFailure) process.exit(1);
    return { ok: false, problems, warnings };
  }

  console.log('[config] Configuration checks passed.');
  return { ok: true, problems, warnings };
}

// ── 2. Security headers (minimal helmet substitute) ────────────────────────
function securityHeaders(req, res, next) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Permitted-Cross-Domain-Policies', 'none');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-site');
  // This is a JSON API; no inline content should ever be rendered from it.
  res.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");
  if (process.env.NODE_ENV === 'production') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  res.removeHeader('X-Powered-By');
  next();
}

// ── 3. NoSQL operator injection ────────────────────────────────────────────
// Mongoose will happily interpret { email: { $ne: null } } as a query operator.
// Several handlers pass request values straight into findOne(), so strip any key
// beginning with '$' or containing '.' before the handler ever sees it.
function scrub(value, depth = 0) {
  if (depth > 8 || value === null || typeof value !== 'object') return value;

  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i += 1) value[i] = scrub(value[i], depth + 1);
    return value;
  }

  for (const key of Object.keys(value)) {
    if (key.startsWith('$') || key.includes('.')) {
      delete value[key];
    } else {
      value[key] = scrub(value[key], depth + 1);
    }
  }
  return value;
}

function sanitizeMongo(req, res, next) {
  try {
    if (req.body && typeof req.body === 'object') scrub(req.body);
    if (req.params && typeof req.params === 'object') scrub(req.params);
    // Express 5 exposes req.query via a memoized getter; mutate in place rather
    // than reassigning (assignment throws on the getter-only property).
    if (req.query && typeof req.query === 'object') scrub(req.query);
  } catch {
    // Never let sanitization break the request pipeline.
  }
  next();
}

// ── 4. Rate Limiter (in-memory or Redis-backed) ──────────────────────────────
// In-memory: single-process only (default, no extra deps).
// Redis-backed: multi-instance safe. Enable by setting REDIS_URL in .env and
// installing: npm i rate-limiter-flexible ioredis
function rateLimit({
  windowMs = 15 * 60 * 1000,
  max = 100,
  message = 'Too many requests. Please slow down.',
  keyGenerator = (req) => req.ip,
  skip = null, // optional: function(req) => bool — if true, skip rate limiting for this request
  // Optional: pass a Redis client to use distributed rate limiting
  redisClient = null,
} = {}) {
  // If Redis client provided, use distributed rate limiter
  if (redisClient) {
    let RateLimiterRedis;
    try {
      ({ RateLimiterRedis } = require('rate-limiter-flexible'));
    } catch (e) {
      console.warn('[rateLimit] rate-limiter-flexible not installed, falling back to in-memory');
      // Fall through to in-memory
    }

    if (RateLimiterRedis) {
      const limiter = new RateLimiterRedis({
        storeClient: redisClient,
        keyPrefix: 'ratelimit:',
        points: max,
        duration: Math.ceil(windowMs / 1000),
      });

      return async function rateLimiter(req, res, next) {
        const key = keyGenerator(req) || 'unknown';
        try {
          const resLimit = await limiter.consume(key);
          res.setHeader('RateLimit-Limit', String(max));
          res.setHeader('RateLimit-Remaining', String(resLimit.remainingPoints));
          res.setHeader('RateLimit-Reset', String(Math.ceil(resLimit.msBeforeNext / 1000)));
          next();
        } catch (rlRes) {
          const retryAfter = Math.ceil(rlRes.msBeforeNext / 1000);
          res.setHeader('Retry-After', String(retryAfter));
          return res.status(429).json({ error: message, retryAfterSeconds: retryAfter });
        }
      };
    }
  }

  // In-memory fallback (single-process)
  const hits = new Map(); // key -> { count, resetAt }

  // Periodic sweep so the Map cannot grow without bound.
  const sweep = setInterval(() => {
    const now = Date.now();
    for (const [key, rec] of hits) if (rec.resetAt <= now) hits.delete(key);
  }, windowMs).unref?.() ?? null;
  void sweep;

  return function rateLimiter(req, res, next) {
    if (skip && skip(req)) return next();
    const key = keyGenerator(req) || 'unknown';
    const now = Date.now();
    let rec = hits.get(key);

    if (!rec || rec.resetAt <= now) {
      rec = { count: 0, resetAt: now + windowMs };
      hits.set(key, rec);
    }
    rec.count += 1;

    const remaining = Math.max(0, max - rec.count);
    res.setHeader('RateLimit-Limit', String(max));
    res.setHeader('RateLimit-Remaining', String(remaining));
    res.setHeader('RateLimit-Reset', String(Math.ceil((rec.resetAt - now) / 1000)));

    if (rec.count > max) {
      const retryAfter = Math.ceil((rec.resetAt - now) / 1000);
      res.setHeader('Retry-After', String(retryAfter));
      return res.status(429).json({ error: message, retryAfterSeconds: retryAfter });
    }
    next();
  };
}

// ── 5. 404 + centralised error handler ─────────────────────────────────────
function notFound(req, res) {
  res.status(404).json({ error: `Not found: ${req.method} ${req.originalUrl}` });
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  // CORS rejections should read as 403, not 500.
  if (err && /Not allowed by CORS/i.test(err.message || '')) {
    return res.status(403).json({ error: 'Origin not allowed by CORS policy.' });
  }
  if (err && err.type === 'entity.too.large') {
    return res.status(413).json({ error: 'Request body too large.' });
  }
  console.error('[unhandled]', err && err.stack ? err.stack : err);
  // Never leak internals to the client in production.
  const expose = process.env.NODE_ENV !== 'production';
  res.status(err?.status || 500).json({
    error: 'Internal server error.',
    ...(expose && err?.message ? { details: err.message } : {}),
  });
}

module.exports = {
  assertConfig,
  securityHeaders,
  sanitizeMongo,
  rateLimit,
  notFound,
  errorHandler,
};
