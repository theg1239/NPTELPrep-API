import { createClient } from 'redis';
import dotenv from 'dotenv';
import { logger } from './logger.js';

dotenv.config();

const redisUrl = process.env.REDISCLOUD_URL;

if (!redisUrl) {
    logger.error('REDISCLOUD_URL is not defined in environment variables.');
    process.exit(1);
}

const redisClient = createClient({
    url: redisUrl,
    legacyMode: false,
});

redisClient.on('error', (err) => logger.error(`Redis Client Error: ${err}`));

const connectRedis = async () => {
    try {
        await redisClient.connect();
        logger.info('Connected to Redis successfully.');
    } catch (error) {
        logger.error(`Failed to connect to Redis: ${error.message}`);
        process.exit(1);
    }
};

connectRedis();

export default redisClient;
