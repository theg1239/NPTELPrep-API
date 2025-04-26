import { PrismaClient } from '@prisma/client'
import { logger } from '../logger.js'
import { randomUUID } from 'crypto'
import dotenv from 'dotenv'
dotenv.config()

const prisma = new PrismaClient()

const publicRoutes = ['/', '/counts', '/health','/report-question']

export const apiKeyMiddleware = async (req, res, next) => {
  if (
    publicRoutes.some(
      (route) =>
        req.path === route || req.path.startsWith(`${route}/`)
    )
  ) {
    return next()
  }

  const apiKey = req.get('X-API-Key')
  if (!apiKey) {
    logger.warn(`API request without API key: ${req.path}`)
    return res.status(401).json({
      error: 'Unauthorized',
      message:
        'API key is required. Please provide a valid API key in the X-API-Key header.',
      documentation: 'https://dashboard.nptelprep.in',
    })
  }

  try {
    const apiKeyRecord = await prisma.apiKey.findUnique({
      where: { key: apiKey },
    })

    if (!apiKeyRecord) {
      logger.warn(
        `API request with invalid API key: ${apiKey.slice(
          0,
          10
        )}...`
      )
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Invalid API key.',
        documentation: 'https://dashboard.nptelprep.in',
      })
    }

    if (apiKeyRecord.isRevoked) {
      logger.warn(
        `API request with revoked API key: ${apiKey.slice(
          0,
          10
        )}...`
      )
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'This API key has been revoked.',
        documentation: 'https://dashboard.nptelprep.in',
      })
    }

    if (
      apiKeyRecord.expiresAt &&
      apiKeyRecord.expiresAt < new Date()
    ) {
      logger.warn(
        `API request with expired API key: ${apiKey.slice(
          0,
          10
        )}...`
      )
      await prisma.apiKey.update({
        where: { id: apiKeyRecord.id },
        data: { isRevoked: true },
      })
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'This API key has expired.',
        documentation: 'https://dashboard.nptelprep.in',
      })
    }

    const startOfDay = new Date()
    startOfDay.setHours(0, 0, 0, 0)
    const endOfDay = new Date()
    endOfDay.setHours(24, 0, 0, 0)

    const usageCount = await prisma.apiUsage.count({
      where: {
        apiKeyId: apiKeyRecord.id,
        timestamp: { gte: startOfDay, lt: endOfDay },
      },
    })

    if (usageCount >= apiKeyRecord.rateLimit) {
      logger.warn(
        `API request exceeded rate limit: ${apiKey.slice(
          0,
          10
        )}...`
      )
      await prisma.apiUsage.create({
        data: {
          id: randomUUID(),
          apiKeyId: apiKeyRecord.id,
          endpoint: req.path,
          success: false,
          ipAddress: req.ip,
          userAgent: req.get('User-Agent'),
          timestamp: new Date(),
        },
      })
      return res.status(429).json({
        error: 'Rate Limit Exceeded',
        message: `You have exceeded the rate limit of ${apiKeyRecord.rateLimit} requests per day.`,
        documentation: 'https://dashboard.nptelprep.in',
      })
    }

    await prisma.apiUsage.create({
      data: {
        id: randomUUID(),
        apiKeyId: apiKeyRecord.id,
        endpoint: req.path,
        success: true,
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
        timestamp: new Date(),
      },
    })

    await prisma.apiKey.update({
      where: { id: apiKeyRecord.id },
      data: { lastUsedAt: new Date() },
    })

    return next()
  } catch (error) {
    logger.error('Error validating API key:', error)
    return res.status(500).json({
      error: 'Internal Server Error',
      message:
        'An error occurred while validating your API key. Please try again later.',
    })
  }
}
