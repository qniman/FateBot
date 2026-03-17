import pino from 'pino';

export type LogLevel = 'error' | 'warn' | 'info' | 'debug';

export interface Logger {
  error(msg: string, ...args: unknown[]): void;
  warn(msg: string, ...args: unknown[]): void;
  info(msg: string, ...args: unknown[]): void;
  debug(msg: string, ...args: unknown[]): void;
  child(bindings: { module?: string }): Logger;
}

function createPinoLogger(level: LogLevel): pino.Logger {
  const isDev = process.env.NODE_ENV !== 'production';
  return pino({
    level,
    transport:
      isDev
        ? { target: 'pino-pretty', options: { colorize: true } }
        : undefined,
  });
}

let rootLogger: pino.Logger | null = null;

export function initLogger(level: LogLevel): Logger {
  rootLogger = createPinoLogger(level);
  return wrapLogger(rootLogger);
}

function wrapLogger(log: pino.Logger): Logger {
  return {
    error(msg: string, ...args: unknown[]) {
      log.error({ args: args.length ? args : undefined }, msg);
    },
    warn(msg: string, ...args: unknown[]) {
      log.warn({ args: args.length ? args : undefined }, msg);
    },
    info(msg: string, ...args: unknown[]) {
      log.info({ args: args.length ? args : undefined }, msg);
    },
    debug(msg: string, ...args: unknown[]) {
      log.debug({ args: args.length ? args : undefined }, msg);
    },
    child(bindings: { module?: string }) {
      return wrapLogger(log.child(bindings));
    },
  };
}

export function getLogger(moduleName?: string): Logger {
  if (!rootLogger) {
    const level = (process.env.LOG_LEVEL ?? 'info').toLowerCase() as LogLevel;
    if (level !== 'error' && level !== 'warn' && level !== 'info' && level !== 'debug') {
      rootLogger = createPinoLogger('info');
    } else {
      rootLogger = createPinoLogger(level);
    }
  }
  const log = moduleName ? rootLogger.child({ module: moduleName }) : rootLogger;
  return wrapLogger(log);
}
