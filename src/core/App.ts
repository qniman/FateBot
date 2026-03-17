import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  Client,
  Events,
  GatewayIntentBits,
  type ChatInputCommandInteraction,
} from 'discord.js';
import type { BotConfig } from '../config/index.js';
import type { Logger } from '../utils/logger.js';
import { loadModules, type RegisteredCommand } from './ModuleLoader.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export class App {
  private readonly config: BotConfig;
  private readonly logger: Logger;
  private client: Client | null = null;
  private commandHandlers = new Map<string, RegisteredCommand['handler']>();

  constructor(config: BotConfig, logger: Logger) {
    this.config = config;
    this.logger = logger;
  }

  async start(): Promise<void> {
    const client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
      ],
    });
    this.client = client;

    const modulesDir =
      __dirname.includes(`${path.sep}dist${path.sep}`)
        ? path.join(__dirname, '..', '..', 'modules')
        : path.join(__dirname, '..', '..', 'modules');

    const rootLogger = this.logger.child ? this.logger.child({ module: 'core' }) : this.logger;
    const { commands } = await loadModules({
      modulesDir,
      client,
      config: this.config,
      rootLogger,
      strictMode: false,
    });

    for (const { command, handler } of commands) {
      const name =
        typeof command === 'object' && command !== null && 'name' in command
          ? String((command as { name: string }).name)
          : null;
      if (name) {
        this.commandHandlers.set(name, handler);
      }
    }

    client.once(Events.ClientReady, async (readyClient) => {
      this.logger.info(`Logged in as ${readyClient.user.tag}`);
      try {
        const payload = commands.map((c) => c.command);
        if (this.config.guildId) {
          const guild = readyClient.guilds.cache.get(this.config.guildId);
          if (guild) {
            await guild.commands.set(payload);
            this.logger.info(
              `Registered ${payload.length} slash command(s) in guild ${this.config.guildId}`
            );
          } else {
            await readyClient.application.commands.set(payload);
            this.logger.warn(
              `Guild ${this.config.guildId} not found; registered ${payload.length} command(s) globally`
            );
          }
        } else {
          await readyClient.application.commands.set(payload);
          this.logger.info(
            `Registered ${payload.length} slash command(s) globally`
          );
        }
      } catch (err) {
        this.logger.error(
          `Failed to register slash commands: ${err instanceof Error ? err.message : String(err)}`
        );
        throw err;
      }
    });

    client.on(Events.InteractionCreate, async (interaction) => {
      if (!interaction.isChatInputCommand()) return;
      const handler = this.commandHandlers.get(interaction.commandName);
      if (!handler) {
        this.logger.warn(`No handler for command: ${interaction.commandName}`);
        try {
          await interaction.reply({
            content: 'Unknown command.',
            ephemeral: true,
          }).catch(() => {});
        } catch {
          // ignore
        }
        return;
      }
      try {
        await handler(interaction as ChatInputCommandInteraction);
      } catch (err) {
        this.logger.error(
          `Command ${interaction.commandName} error: ${err instanceof Error ? err.message : String(err)}`
        );
        try {
          const reply = {
            content: 'An error occurred while running this command.',
            ephemeral: true,
          };
          if (interaction.replied || interaction.deferred) {
            await interaction.followUp(reply).catch(() => {});
          } else {
            await interaction.reply(reply).catch(() => {});
          }
        } catch {
          // ignore
        }
      }
    });

    await client.login(this.config.discordToken);
  }

  getClient(): Client | null {
    return this.client;
  }
}
