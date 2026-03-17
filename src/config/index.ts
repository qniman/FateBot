import 'dotenv/config';

export interface BotConfig {
  discordToken: string;
  clientId: string;
  guildId: string | null;
  logLevel: 'error' | 'warn' | 'info' | 'debug';
}

function getLogLevel(): BotConfig['logLevel'] {
  const level = (process.env.LOG_LEVEL ?? 'info').toLowerCase();
  if (level === 'error' || level === 'warn' || level === 'info' || level === 'debug') {
    return level;
  }
  return 'info';
}

export function loadConfig(): BotConfig {
  const discordToken = process.env.DISCORD_TOKEN;
  if (!discordToken?.trim()) {
    throw new Error('DISCORD_TOKEN is required. Set it in .env or environment.');
  }

  const clientId = process.env.CLIENT_ID ?? '';
  const guildId = process.env.GUILD_ID?.trim() ?? null;

  return {
    discordToken: discordToken.trim(),
    clientId: clientId.trim(),
    guildId: guildId || null,
    logLevel: getLogLevel(),
  };
}
