import type { IModule } from '../../src/core/types.js';
import { Events } from 'discord.js';
import { loadInactiveConfig } from './loadConfig.js';
import { initDb, insertEvent, getTopActive, getTopInactive } from './db.js';

const TOP_COUNT = 3;
const LIMIT_ACTIVE = TOP_COUNT;
const LIMIT_INACTIVE = TOP_COUNT;

const module: IModule = {
  name: 'inactive',
  version: '1.0.0',
  async register(context) {
    const cfg = loadInactiveConfig();
    const { client, logger, config } = context;
    const activeCfg = {
      reportChannelId: cfg?.reportChannelId?.trim() ?? '',
      reportIntervalHours: cfg?.reportIntervalHours ?? 24,
      guildId: cfg?.guildId,
    };

    const guildId = activeCfg.guildId?.trim() || config.guildId || null;
    if (!guildId) {
      logger.warn('Inactive: guildId not set in config or bot config, tracking all guilds.');
    }

    let dbReady = false;
    try {
      await initDb();
      dbReady = true;
    } catch (err) {
      logger.error(
        `Inactive: failed to initialize database, command will be unavailable: ${err instanceof Error ? err.message : String(err)}`
      );
    }

    function shouldTrack(guildIdFromEvent: string): boolean {
      if (!guildId) return true;
      return guildIdFromEvent === guildId;
    }

    client.on(Events.MessageCreate, (message) => {
      if (!dbReady || message.author.bot) return;
      if (!shouldTrack(message.guildId ?? '')) return;
      insertEvent(message.guildId!, message.author.id, 'message');
    });

    client.on(Events.MessageReactionAdd, (reaction, user) => {
      if (!dbReady || user.bot) return;
      const gid = reaction.message.guildId;
      if (!gid || !shouldTrack(gid)) return;
      insertEvent(gid, user.id, 'reaction');
    });

    client.on(Events.VoiceStateUpdate, (oldState, newState) => {
      if (!dbReady) return;
      const member = newState.member;
      if (!member?.user || member.user.bot) return;
      const gid = newState.guild.id;
      if (!shouldTrack(gid)) return;
      if (!oldState.channelId && newState.channelId) {
        insertEvent(gid, member.id, 'voice_join');
      }
    });

    async function sendReport(): Promise<void> {
      const targetGuildId = guildId || (client.guilds.cache.first()?.id ?? null);
      if (!targetGuildId) return;
      const channel = await client.channels.fetch(activeCfg.reportChannelId).catch(() => null);
      if (!channel?.isTextBased() || !('send' in channel)) {
        logger.warn('Inactive: report channel not found or not text channel.');
        return;
      }
      const sinceTs = Math.floor(Date.now() / 1000) - activeCfg.reportIntervalHours * 3600;
      const [topActive, topInactive] = [
        getTopActive(targetGuildId, sinceTs, LIMIT_ACTIVE),
        getTopInactive(targetGuildId, sinceTs, LIMIT_INACTIVE),
      ];
      const guild = await client.guilds.fetch(targetGuildId).catch(() => null);
      const formatUser = async (userId: string, count: number): Promise<string> => {
        if (!guild) return `<@${userId}> — ${count}`;
        const member = await guild.members.fetch(userId).catch(() => null);
        const name = member?.user.tag ?? member?.displayName ?? `<@${userId}>`;
        return `${name} — ${count}`;
      };
      const periodText = `За последние ${activeCfg.reportIntervalHours} ч.`;
      const lines: string[] = [
        `**Отчёт по активности** (${periodText})`,
        '',
        '**Топ-3 активных:**',
        ...(await Promise.all(topActive.map((r) => formatUser(r.userId, r.count)))),
        '',
        '**Топ-3 неактивных:**',
        ...(await Promise.all(topInactive.map((r) => formatUser(r.userId, r.count)))),
      ];
      if (topActive.length === 0 && topInactive.length === 0) {
        lines.push('_Нет данных за период._');
      }
      await (channel as import('discord.js').TextChannel)
        .send(lines.join('\n'))
        .catch((err) => logger.error(`Inactive: send report failed: ${err}`));
    }

    if (dbReady && activeCfg.reportChannelId) {
      const intervalMs = activeCfg.reportIntervalHours * 60 * 60 * 1000;
      let timer: ReturnType<typeof setInterval> | null = null;
      client.once(Events.ClientReady, () => {
        timer = setInterval(() => sendReport(), intervalMs);
        logger.info(`Inactive: report scheduled every ${activeCfg.reportIntervalHours} h.`);
      });
    } else if (!activeCfg.reportChannelId) {
      logger.warn('Inactive: reportChannelId is empty, periodic reports disabled.');
    }

    context.registerSlashCommand(
      {
        name: 'inactive-report',
        description: 'Вывести отчёт по активности (топ-3 активных и неактивных)',
      },
      async (interaction) => {
        if (!dbReady) {
          await interaction.reply({
            content: 'Модуль инактива не инициализировался (БД недоступна). Проверьте логи бота.',
            ephemeral: true,
          });
          return;
        }
        const gid = interaction.guildId;
        if (!gid) {
          await interaction.reply({ content: 'Команда только для сервера.', ephemeral: true });
          return;
        }
        await interaction.deferReply({ ephemeral: true });
        const sinceTs = Math.floor(Date.now() / 1000) - activeCfg.reportIntervalHours * 3600;
        const [topActive, topInactive] = [
          getTopActive(gid, sinceTs, LIMIT_ACTIVE),
          getTopInactive(gid, sinceTs, LIMIT_INACTIVE),
        ];
        const guild = interaction.guild!;
        const formatUser = async (userId: string, count: number): Promise<string> => {
          const member = await guild.members.fetch(userId).catch(() => null);
          const name = member?.user.tag ?? member?.displayName ?? `<@${userId}>`;
          return `${name} — ${count}`;
        };
        const periodText = `За последние ${activeCfg.reportIntervalHours} ч.`;
        const lines: string[] = [
          `**Отчёт по активности** (${periodText})`,
          '',
          '**Топ-3 активных:**',
          ...(await Promise.all(topActive.map((r) => formatUser(r.userId, r.count)))),
          '',
          '**Топ-3 неактивных:**',
          ...(await Promise.all(topInactive.map((r) => formatUser(r.userId, r.count)))),
        ];
        if (topActive.length === 0 && topInactive.length === 0) {
          lines.push('_Нет данных за период._');
        }
        await interaction.editReply(lines.join('\n'));
      }
    );

    context.registerSlashCommand(
      {
        name: 'inactive-status',
        description: 'Показать статус модуля инактива',
      },
      async (interaction) => {
        const targetGuildId = guildId || interaction.guildId || null;
        const reportChannelSet = Boolean(activeCfg.reportChannelId?.trim());
        const reportChannel = reportChannelSet
          ? await client.channels.fetch(activeCfg.reportChannelId).catch(() => null)
          : null;
        const channelStatus = !reportChannelSet
          ? 'не задан'
          : reportChannel?.isTextBased()
            ? `доступен (<#${activeCfg.reportChannelId}>)`
            : 'не найден/недоступен';

        const lines = [
          '**Статус модуля "Инактив"**',
          `- База данных: ${dbReady ? 'готова' : 'ошибка инициализации'}`,
          `- Канал отчётов: ${channelStatus}`,
          `- Интервал отчётов: ${activeCfg.reportIntervalHours} ч.`,
          `- Отслеживаемая гильдия: ${targetGuildId ?? 'не задана (все доступные)'}`,
          `- Сбор событий: ${dbReady ? 'включен' : 'выключен'}`,
        ];

        await interaction.reply({
          content: lines.join('\n'),
          ephemeral: true,
        });
      }
    );
  },
};

export default module;
