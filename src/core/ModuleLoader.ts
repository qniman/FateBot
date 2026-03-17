import * as fs from 'node:fs';
import * as path from 'node:path';
import * as url from 'node:url';
import type { IModule, ModuleContext } from './types.js';
import type { Logger } from '../utils/logger.js';
import type { BotConfig } from '../config/index.js';
import type { Client } from 'discord.js';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));

export interface ModuleLoaderOptions {
  modulesDir: string;
  client: Client;
  config: BotConfig;
  rootLogger: Logger;
  /** When a module throws during load, continue loading others if false; stop if true */
  strictMode?: boolean;
}

export interface RegisteredCommand {
  command: import('./types.js').SlashCommandData;
  handler: import('./types.js').SlashCommandHandler;
}

export interface ModuleLoaderResult {
  commands: RegisteredCommand[];
  loadedModuleNames: string[];
}

/**
 * Scans modulesDir for subdirectories, loads each as a module (index.js or index.ts),
 * and calls register(context) on each. Returns collected slash commands and handlers.
 */
export async function loadModules(
  options: ModuleLoaderOptions
): Promise<ModuleLoaderResult> {
  const { modulesDir, client, config, rootLogger, strictMode = false } = options;
  const commands: RegisteredCommand[] = [];
  const loadedModuleNames: string[] = [];

  if (!fs.existsSync(modulesDir)) {
    rootLogger.warn(`Modules directory does not exist: ${modulesDir}`);
    return { commands, loadedModuleNames };
  }

  const entries = fs.readdirSync(modulesDir, { withFileTypes: true });
  const dirs = entries.filter((e) => e.isDirectory()).map((e) => e.name);

  for (const dirName of dirs) {
    const modulePath = path.join(modulesDir, dirName);
    const indexPath = path.join(modulePath, 'index.js');
    const indexTsPath = path.join(modulePath, 'index.ts');

    let resolvedPath: string;
    if (fs.existsSync(indexPath)) {
      resolvedPath = indexPath;
    } else if (fs.existsSync(indexTsPath)) {
      resolvedPath = indexTsPath;
    } else {
      rootLogger.debug(`Module ${dirName}: no index.js or index.ts, skipping`);
      continue;
    }

    try {
      const mod = await import(url.pathToFileURL(resolvedPath).href);
      const moduleExport: IModule = mod.default ?? mod.module ?? mod;
      if (!moduleExport?.name || typeof moduleExport.register !== 'function') {
        rootLogger.warn(
          `Module ${dirName}: invalid export (need default or .module with name and register), skipping`
        );
        continue;
      }

      const logger = rootLogger.child({ module: moduleExport.name });
      const context: ModuleContext = {
        client,
        logger,
        config,
        registerSlashCommand(command, handler) {
          const name =
            typeof command === 'object' && command !== null && 'name' in command
              ? String((command as { name: string }).name)
              : undefined;
          if (!name) {
            logger.warn('registerSlashCommand: command has no name, skipping');
            return;
          }
          commands.push({ command, handler });
        },
        registerSlashCommands(entries) {
          for (const { command, handler } of entries) {
            context.registerSlashCommand(command, handler);
          }
        },
      };

      await Promise.resolve(moduleExport.register(context));
      loadedModuleNames.push(moduleExport.name);
      rootLogger.info(
        `Module loaded: ${moduleExport.name} v${moduleExport.version ?? '?'}`
      );
    } catch (err) {
      rootLogger.error(
        `Failed to load module ${dirName}: ${err instanceof Error ? err.message : String(err)}`
      );
      if (strictMode) {
        throw err;
      }
    }
  }

  return { commands, loadedModuleNames };
}
