import { logger } from '../logger.js';
import pkg from 'pg';
const { Pool } = pkg;
import { randomUUID } from 'crypto';
import dotenv from 'dotenv';
dotenv.config();

const exemptDomains = (process.env.EXEMPT_DOMAINS || 'https://nptelprep.in')
  .split(',')
  .map(d => d.trim())
  .filter(Boolean);

const pool = new Pool({
  connectionString: process.env.AUTH_DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production'
    ? { rejectUnauthorized: false }
    : false,
});

const publicRoutes = [
  '/',
  '/counts',
  '/health'
];

export const apiKeyMiddleware = async (req, res, next) => {
  const requestHost = req.hostname;
  if (exemptDomains.includes(requestHost)) {
    logger.info(`Bypassing API key checks for exempt domain: ${requestHost}`);
    return next();
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
      message: 'API key is required. Please provide a valid API key in the X-API-Key header.',
      documentation: 'https://dashboard.nptelprep.in'
    });
  }

  try {
    const keyResult = await pool.query(`
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

    if (keyResult.rows.length === 0) {
      logger.warn(`API request with invalid API key: ${apiKey.slice(0, 10)}...`);
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Invalid API key.',
        documentation: 'https://dashboard.nptelprep.in'
      });
    }

    const apiKeyData = keyResult.rows[0];

    if (apiKeyData.isRevoked) {
      logger.warn(`API request with revoked API key: ${apiKey.slice(0, 10)}...`);
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'This API key has been revoked.',
        documentation: 'https://dashboard.nptelprep.in'
      });
    }

    if (apiKeyData.expiresAt && new Date(apiKeyData.expiresAt) < new Date()) {
      logger.warn(`API request with expired API key: ${apiKey.slice(0, 10)}...`);
      await pool.query(`
        UPDATE "ApiKey"
        SET "isRevoked" = true
        WHERE id = $1
      `, [apiKeyData.id]);

      return res.status(401).json({
        error: 'Unauthorized',
        message: 'This API key has expired.',
        documentation: 'https://dashboard.nptelprep.in'
      });
    }

    if (apiKeyData.usage_count >= apiKeyData.rateLimit) {
      logger.warn(`API request exceeded rate limit: ${apiKey.slice(0, 10)}...`);
      await trackApiUsage(
        apiKeyData.id,
        req.path,
        false,
        req.ip,
        req.get('User-Agent')
      );
      return res.status(429).json({
        error: 'Rate Limit Exceeded',
        message: `You have exceeded the rate limit of ${apiKeyData.rateLimit} requests per day.`,
        documentation: 'https://dashboard.nptelprep.in'
      });
    }

    await trackApiUsage(
      apiKeyData.id,
      req.path,
      true,
      req.ip,
      req.get('User-Agent')
    );
    await pool.query(`
      UPDATE "ApiKey"
      SET "lastUsedAt" = NOW()
      WHERE id = $1
    `, [apiKeyData.id]);

    next();
  } catch (error) {
    logger.error(`Error validating API key: ${error.message}`);
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'An error occurred while validating your API key.'
    });
  }
};

async function trackApiUsage(
  apiKeyId,
  endpoint,
  success = true,
  ipAddress = null,
  userAgent = null
) {
  try {
    const id = randomUUID();
    await pool.query(`
      INSERT INTO "ApiUsage" (
        id,
        "apiKeyId",
        endpoint,
        success,
        "ipAddress",
        "userAgent",
        timestamp
      ) VALUES (
        $1, $2, $3, $4, $5, $6, NOW()
      )
    `, [id, apiKeyId, endpoint, success, ipAddress, userAgent]);
  } catch (err) {
    logger.error(`Error tracking API usage: ${err.message}`);
  }
}
