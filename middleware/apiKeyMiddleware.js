import { logger } from '../logger.js';
import pkg from 'pg';
const { Pool } = pkg;
import { randomUUID } from 'crypto';
import dotenv from 'dotenv';
dotenv.config();

const exemptOrigins = (process.env.EXEMPT_ORIGINS || '')
  .split(',')
  .map(u => u.trim())
  .filter(Boolean)
  .map(u => {
    try { return new URL(u).hostname; }
    catch { return null; }
  })
  .filter(Boolean);

const pool = new Pool({
  connectionString: process.env.AUTH_DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production'
    ? { rejectUnauthorized: false }
    : false,
});

const publicRoutes = ['/', '/counts', '/health'];

export const apiKeyMiddleware = async (req, res, next) => {
  if (req.method === 'OPTIONS') {
    return next();
  }

  const origin = req.header('Origin');
  if (origin) {
    try {
      const originHost = new URL(origin).hostname;
      if (exemptOrigins.includes(originHost)) {
        logger.info(`Bypassing API key checks for frontend origin: ${originHost}`);
        return next();
      }
    } catch {
    }
  }

  if (publicRoutes.some(route =>
    req.path === route || req.path.startsWith(`${route}/`)
  )) {
    return next();
  }

  const apiKey = req.header('X-API-Key');
  if (!apiKey) {
    logger.warn(`API request without API key: ${req.path}`);
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'API key is required in the X-API-Key header.',
      documentation: 'https://dashboard.nptelprep.in'
    });
  }

  try {
    const { rows } = await pool.query(`
      SELECT
        ak.*,
        COUNT(au.id)::int AS usage_count
      FROM "ApiKey" ak
      LEFT JOIN "ApiUsage" au
        ON ak.id = au."apiKeyId"
        AND au.timestamp::date = CURRENT_DATE
      WHERE ak.key = $1
      GROUP BY ak.id
    `, [apiKey]);

    if (rows.length === 0) {
      logger.warn(`Invalid API key: ${apiKey.slice(0,10)}…`);
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Invalid API key.',
        documentation: 'https://dashboard.nptelprep.in'
      });
    }

    const key = rows[0];
    if (key.isRevoked) {
      logger.warn(`Revoked API key: ${apiKey.slice(0,10)}…`);
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'This API key has been revoked.',
        documentation: 'https://dashboard.nptelprep.in'
      });
    }

    if (key.expiresAt && new Date(key.expiresAt) < new Date()) {
      logger.warn(`Expired API key: ${apiKey.slice(0,10)}…`);
      await pool.query(`
        UPDATE "ApiKey"
        SET "isRevoked" = true
        WHERE id = $1
      `, [key.id]);
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'This API key has expired.',
        documentation: 'https://dashboard.nptelprep.in'
      });
    }

    if (key.usage_count >= key.rateLimit) {
      logger.warn(`Rate limit exceeded: ${apiKey.slice(0,10)}…`);
      await trackApiUsage(key.id, req.path, false, req.ip, req.get('User-Agent'));
      return res.status(429).json({
        error: 'Rate Limit Exceeded',
        message: `You have exceeded your daily limit of ${key.rateLimit} requests.`,
        documentation: 'https://dashboard.nptelprep.in'
      });
    }

    await trackApiUsage(key.id, req.path, true, req.ip, req.get('User-Agent'));
    await pool.query(`
      UPDATE "ApiKey"
      SET "lastUsedAt" = NOW()
      WHERE id = $1
    `, [key.id]);

    next();
  } catch (err) {
    logger.error(`Error validating API key: ${err.message}`);
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'An error occurred while validating your API key.'
    });
  }
};

async function trackApiUsage(apiKeyId, endpoint, success = true, ipAddress = null, userAgent = null) {
  try {
    await pool.query(`
      INSERT INTO "ApiUsage" (
        id, "apiKeyId", endpoint, success, "ipAddress", "userAgent", timestamp
      ) VALUES ($1,$2,$3,$4,$5,$6,NOW())
    `, [randomUUID(), apiKeyId, endpoint, success, ipAddress, userAgent]);
  } catch (e) {
    logger.error(`Error tracking API usage: ${e.message}`);
  }
}
