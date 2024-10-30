import winston from 'winston';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const logFormat = winston.format.printf(({ timestamp, level, message }) => {
    return `${timestamp} [${level.toUpperCase()}]: ${message}`;
});

const jsonFormat = winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
);

const logger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(
        winston.format.timestamp(),
        logFormat
    ),
    transports: [
        new winston.transports.Console(),
        
        new winston.transports.File({ filename: path.join(__dirname, 'combined.log') }),
        
        new winston.transports.File({ filename: path.join(__dirname, 'error.log'), level: 'error' }),
    ],
});

const questionLogger = winston.createLogger({
    level: 'info',
    format: jsonFormat,
    transports: [
        new winston.transports.File({ filename: path.join(__dirname, 'questions.log') }),
    ],
});

export { logger, questionLogger };
