import type {
  Client,
  ChatInputCommandInteraction,
  ApplicationCommandDataResolvable,
} from 'discord.js';
import type { BotConfig } from '../config/index.js';
import type { Logger } from '../utils/logger.js';

/** Slash command payload for registration (discord.js accepts this for application.commands.set) */
export type SlashCommandData = ApplicationCommandDataResolvable;

/** Handler for a slash command by name */
export type SlashCommandHandler = (
  interaction: ChatInputCommandInteraction
) => Promise<void> | void;

/** Context passed to each module on register */
export interface ModuleContext {
  client: Client;
  logger: Logger;
  config: BotConfig;
  /** Register a single slash command (payload) and its handler */
  registerSlashCommand(
    command: SlashCommandData,
    handler: SlashCommandHandler
  ): void;
  /** Register multiple slash commands with their handlers */
  registerSlashCommands(
    entries: Array<{ command: SlashCommandData; handler: SlashCommandHandler }>
  ): void;
}

/** Contract for a loadable module */
export interface IModule {
  name: string;
  version: string;
  register(context: ModuleContext): void | Promise<void>;
}
