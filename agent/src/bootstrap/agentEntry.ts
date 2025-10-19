import process from 'node:process';
import path from 'node:path';
import dotenv from 'dotenv';

import type { AgentLogger } from '../logging/logger.js';

let agentLogger: AgentLogger | null = null;
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

    agentLogger?.info(`Received ${signal}. Shutting down agent gracefully.`);

    try {
      await closeDataSources();
    } catch (error) {
      agentLogger?.error(
        `Error while closing resources: ${(error as Error).message}`
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
    agentLogger?.error(`Unhandled rejection: ${String(reason)}`);
  });
};

const bootstrap = async () => {
  loadEnvironment();

  const [{ agentLogger: logger }, changeStagerModule, agentModule, dataModule] =
    await Promise.all([
      import('../logging/logger.js'),
      import('../changes/changeStager.js'),
      import('../agent/agentLoop.js'),
      import('../data/dataSources.js'),
    ]);

  agentLogger = logger;

  if (envFallbackUsed) {
    agentLogger.warn({
      event: 'env_fallback',
      agent: 'qa',
      message: 'Loaded environment variables from project root .env. Add agent/.env to override.',
    });
  }

  registerSignalHandlers(dataModule.closeDataSources);

  await changeStagerModule.ensureChangesDirectory();
  agentLogger.info({ event: 'bootstrap_complete', agent: 'qa' });
  await agentModule.runAgentLoop();
};

bootstrap().catch(async (error) => {
  if (!agentLogger) {
    console.error(`Agent failed during startup: ${(error as Error).message}`);
  } else {
    agentLogger.error({
      event: 'bootstrap_failed',
      agent: 'qa',
      error: (error as Error).message,
    });
    await (await import('../data/dataSources.js')).closeDataSources().catch(() => {});
  }
  process.exit(1);
});
