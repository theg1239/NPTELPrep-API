import process from 'node:process';
import path from 'node:path';
import dotenv from 'dotenv';

import type { AgentLogger } from '../logging/logger.js';

let reviewerLogger: AgentLogger | null = null;
let envFallbackUsed = false;

const loadEnvironment = () => {
  const agentEnvPath = path.resolve(process.cwd(), 'agent', '.env');
  const rootEnvPath = path.resolve(process.cwd(), '.env');

  const agentEnv = dotenv.config({ path: agentEnvPath });

  if (agentEnv.error) {
    envFallbackUsed = true;
    console.warn(
      `Unable to load agent-specific env at ${agentEnvPath}. Falling back to ${rootEnvPath}.`
    );
    dotenv.config({ path: rootEnvPath });
  }
};

const registerSignalHandlers = (
  closeDataSources: () => Promise<void> | PromiseLike<void>
) => {
  let shuttingDown = false;

  const shutdown = async (signal: NodeJS.Signals) => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;

    reviewerLogger?.info(`Received ${signal}. Shutting down reviewer agent gracefully.`);

    try {
      await closeDataSources();
    } catch (error) {
      reviewerLogger?.error(
        `Error while closing reviewer resources: ${(error as Error).message}`
      );
    } finally {
      process.exit(0);
    }
  };

  process.on('SIGINT', () => {
    void shutdown('SIGINT');
  });
  process.on('SIGTERM', () => {
    void shutdown('SIGTERM');
  });
  process.on('unhandledRejection', (reason) => {
    reviewerLogger?.error(`Unhandled rejection: ${String(reason)}`);
  });
};

const bootstrap = async () => {
  loadEnvironment();

  const [{ agentLogger }, stagedChangesModule, reviewerModule, dataModule] =
    await Promise.all([
      import('../logging/logger.js'),
      import('../changes/stagedChanges.js'),
      import('../reviewer/reviewerLoop.js'),
      import('../data/dataSources.js'),
    ]);

  reviewerLogger = agentLogger;

  if (envFallbackUsed) {
    reviewerLogger.warn({
      event: 'env_fallback',
      agent: 'reviewer',
      message: 'Loaded environment variables from project root .env. Add agent/.env to override for reviewer agent.',
    });
  }

  registerSignalHandlers(dataModule.closeDataSources);

  await stagedChangesModule.ensureChangeQueues();
  reviewerLogger.info({ event: 'bootstrap_complete', agent: 'reviewer' });
  await reviewerModule.runReviewerLoop();
};

bootstrap().catch(async (error) => {
  if (!reviewerLogger) {
    console.error(`Reviewer agent failed during startup: ${(error as Error).message}`);
  } else {
    reviewerLogger.error({
      event: 'bootstrap_failed',
      agent: 'reviewer',
      error: (error as Error).message,
    });
    await (await import('../data/dataSources.js')).closeDataSources().catch(() => {});
  }
  process.exit(1);
});
