import winston from 'winston';

const jsonFormatter = winston.format.printf(({ level, message, timestamp, ...metadata }) => {
  const base: Record<string, unknown> = {
    timestamp,
    level: level.toUpperCase(),
  };

  if (typeof message === 'string') {
    try {
      const parsed = JSON.parse(message);
      Object.assign(base, parsed);
    } catch {
      base.message = message;
    }
  } else if (typeof message === 'object' && message !== null) {
    Object.assign(base, message as Record<string, unknown>);
  } else if (message !== undefined) {
    base.message = message;
  }

  if (Object.keys(metadata).length > 0) {
    base.meta = metadata;
  }

  return JSON.stringify(base);
});

export const agentLogger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    jsonFormatter
  ),
  transports: [new winston.transports.Console()],
});

export type AgentLogger = typeof agentLogger;
