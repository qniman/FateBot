import { loadConfig } from './config/index.js';
import { initLogger } from './utils/logger.js';
import { App } from './core/App.js';

function main(): void {
  const config = loadConfig();
  const logger = initLogger(config.logLevel);

  process.on('uncaughtException', (err) => {
    logger.error(`uncaughtException: ${err.message}`);
    console.error(err);
    process.exit(1);
  });

  process.on('unhandledRejection', (reason, promise) => {
    logger.error(`unhandledRejection: ${String(reason)}`);
    console.error('Promise:', promise);
  });

  const app = new App(config, logger);
  app.start().catch((err) => {
    logger.error(`Failed to start: ${err instanceof Error ? err.message : String(err)}`);
    console.error(err);
    process.exit(1);
  });
}

main();
