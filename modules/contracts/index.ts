import type { IModule } from '../../src/core/types.js';
import { Events } from 'discord.js';
import { Routes } from 'discord-api-types/v10';
import { loadContractsConfig } from './loadConfig.js';
import { parseSkillsFromModalValues } from './formSkills.js';
import {
  sendRejectTicketFromForm,
  sendApprovalTicketFromForm,
  sendAutoApprovedTicketFromForm,
  ensureRulesMessage,
  ensureApplicationButtonMessage,
  buildModalForStep,
  buildNextButton,
  getStepFromModalId,
  getFieldIdsForStep,
  getSkillIndicesForStep,
  isModalNextButton,
  getModalNextStep,
  BUTTON_APPLY_MODAL_ID,
  MODAL_TOTAL_STEPS,
} from './tickets.js';

/** State for multi-step modal: passport + 25 skill values by index and last completed step. */
const modalState = new Map<
  string,
  { passport: string; skills: (string | undefined)[]; lastStep: number }
>();

const REJECT_REASONS: Record<string, string> = {
  no_skills_parsed: 'Не удалось найти поля навыков (ожидаются строки вида «Сила: 1», «Стрельба: 2» и т.д.).',
};

const module: IModule = {
  name: 'contracts',
  version: '1.0.0',
  register(context) {
    const cfg = loadContractsConfig();
    const { client, logger } = context;

    const rolesContractId = cfg.channelIds.rolesContract;
    const adminReviewId = cfg.channelIds.adminReview || cfg.channelIds.rolesContract;
    const approvalTicketsId = cfg.channelIds.approvalTickets || cfg.channelIds.rolesContract;
    const rulesContractsId = cfg.channelIds.rulesContracts;
    const logsId = cfg.channelIds.logs;
    const rolePendingId = cfg.roleIds.contractsPending;
    const roleContractsId = cfg.roleIds.contracts;
    const minSumForAutoApprove = cfg.minSumForAutoApprove ?? 30;

    client.on(Events.InteractionCreate, async (interaction) => {
      // Кнопка «Подать заявку»
      if (interaction.isButton() && interaction.customId === BUTTON_APPLY_MODAL_ID) {
        modalState.set(interaction.user.id, { passport: '', skills: Array(25), lastStep: -1 });
        await interaction
          .showModal(buildModalForStep(0))
          .catch((err) => {
            logger.error(`Contracts: show modal failed: ${err}`);
          });
        return;
      }

      // Кнопки «Далее» / «Отправить» между шагами
      if (interaction.isButton() && isModalNextButton(interaction.customId)) {
        const userId = interaction.user.id;
        const state = modalState.get(userId);
        if (!state) {
          await interaction
            .reply({
              content:
                'Эта заявка уже завершена или сброшена. Нажмите «Подать заявку», чтобы начать заново.',
              ephemeral: true,
            })
            .catch(() => {});
          return;
        }
        const currentStep = getModalNextStep(interaction.customId);
        if (state.lastStep !== currentStep) {
          await interaction
            .reply({
              content: 'Этот шаг уже пройден. Пожалуйста, продолжайте по последнему сообщению.',
              ephemeral: true,
            })
            .catch(() => {});
          return;
        }
        const nextStep = currentStep + 1;
        if (nextStep >= MODAL_TOTAL_STEPS) {
          await interaction
            .reply({
              content: 'Форма уже отправлена. Если нужно, подайте новую заявку.',
              ephemeral: true,
            })
            .catch(() => {});
          return;
        }
        await interaction
          .showModal(buildModalForStep(nextStep))
          .catch((err) => {
            logger.error(`Contracts: show modal step failed: ${err}`);
          });
        return;
      }

      // Отправка шагов модального окна
      if (interaction.isModalSubmit() && interaction.customId.startsWith('contracts_modal_')) {
        const step = getStepFromModalId(interaction.customId);
        if (step < 0) return;
        const isLastStep = step >= MODAL_TOTAL_STEPS - 1;
        const userId = interaction.user.id;
        let state = modalState.get(userId);
        if (!state) state = { passport: '', skills: Array(25), lastStep: -1 };
        const fieldIds = getFieldIdsForStep(step);
        const indices = getSkillIndicesForStep(step);
        for (let i = 0; i < fieldIds.length; i++) {
          const val = interaction.fields.getTextInputValue(fieldIds[i]).trim();
          if (indices[i] === -1) state.passport = val;
          else state.skills[indices[i]] = val;
        }
        state.lastStep = step;
        modalState.set(userId, state);

        // Промежуточные шаги: просто показать кнопку «Далее»
        if (!isLastStep) {
          await interaction
            .reply({
              content: `Часть ${step + 2}/${MODAL_TOTAL_STEPS}. Нажмите кнопку ниже.`,
              ephemeral: true,
              components: [buildNextButton(step)],
            })
            .catch(() => {});
          return;
        }

        // Последний шаг: быстро подтверждаем и дальше выполняем тяжёлую логику
        await interaction.deferReply({ ephemeral: true }).catch(() => {});

        modalState.delete(userId);
        const passport = state.passport;
        const skillValues = state.skills.map((s) => s ?? '');
        const { levels, sum } = parseSkillsFromModalValues(skillValues, cfg.maxSkillLevel);
        const result: import('./formSkills.js').FormParseResult = {
          success: true,
          sum,
          levels,
          userId,
        };
        const formText = `Заявка от <@${userId}>.\nНомер паспорта: ${passport}.\n\nНавыки: ${skillValues.join(
          ', '
        )}`;

        const rolesChannel = await client.channels.fetch(rolesContractId).catch(() => null);
        if (!rolesChannel || !rolesChannel.isTextBased() || !('send' in rolesChannel)) {
          await interaction
            .editReply({ content: 'Ошибка: канал заявок недоступен.' })
            .catch(() => {});
          return;
        }
        const textChannel = rolesChannel as import('discord.js').TextChannel;
        const appMessage = await textChannel
          .send({
            content: `Заявка от <@${userId}>.\nНомер паспорта: **${passport}**.`,
          })
          .catch(() => null);
        if (!appMessage) {
          await interaction
            .editReply({ content: 'Не удалось отправить заявку в канал.' })
            .catch(() => {});
          return;
        }
        const thread = await appMessage
          .startThread({
            name: `Заявка — паспорт ${passport.slice(0, 20)}`,
            autoArchiveDuration: 10080,
          })
          .catch(() => null);
        if (thread) {
          await thread
            .send(`Сумма навыков: **${sum}**. Уровни: ${levels.join(', ')}.`)
            .catch(() => {});
        }

        logger.info(`Contracts: form parsed sum=${result.sum} levels=[${result.levels.join(',')}]`);
        const autoApprove = result.sum >= minSumForAutoApprove && result.userId;
        if (autoApprove && result.userId) {
          const guild = interaction.guild;
          if (guild && rolePendingId) {
            const member = await guild.members.fetch(result.userId).catch(() => null);
            if (member) {
              await member.roles.add(rolePendingId).catch((err) => {
                logger.error(`Contracts: auto-approve failed to add pending role: ${err}`);
              });
            }
          }
          await appMessage.react('✅').catch(() => {});
          const approvalChannel = await client.channels.fetch(approvalTicketsId).catch(() => null);
          if (approvalChannel?.isTextBased() && 'send' in approvalChannel) {
            await sendAutoApprovedTicketFromForm(
              approvalChannel as import('discord.js').TextChannel,
              formText,
              result
            );
          }
          await interaction
            .editReply({
              content: `Заявка принята. Сумма навыков: **${result.sum}**. Доступ к правилам выдан автоматически.`,
            })
            .catch(() => {});
        } else {
          await appMessage.react('⏳').catch(() => {});
          const approvalChannel = await client.channels.fetch(approvalTicketsId).catch(() => null);
          if (approvalChannel?.isTextBased() && 'send' in approvalChannel) {
            await sendApprovalTicketFromForm(
              approvalChannel as import('discord.js').TextChannel,
              formText,
              result,
              rolesContractId,
              appMessage.id
            );
          }
          await interaction
            .editReply({
              content: `Заявка создана. Сумма навыков: **${result.sum}**. Ожидайте одобрения администрации.`,
            })
            .catch(() => {});
        }
        return;
      }

      if (!interaction.isButton()) return;
      const customId = interaction.customId;

      if (customId.startsWith('contracts_approve:')) {
        const rest = customId.slice('contracts_approve:'.length);
        const lastColon = rest.lastIndexOf(':');
        const userId = lastColon >= 0 ? rest.slice(0, lastColon) : rest;
        const sourceMessageId = lastColon >= 0 ? rest.slice(lastColon + 1) : null;
        const guild = interaction.guild;
        if (!guild) return;
        const member = await guild.members.fetch(userId).catch(() => null);
        if (member && rolePendingId) {
          await member.roles.add(rolePendingId).catch((err) => {
            logger.error(`Contracts: failed to add pending role: ${err}`);
          });
        }
        if (sourceMessageId && rolesContractId) {
          const sourceChannel = await client.channels.fetch(rolesContractId).catch(() => null);
          if (sourceChannel?.isTextBased() && 'messages' in sourceChannel) {
            const sourceMsg = await (sourceChannel as import('discord.js').TextChannel).messages.fetch(sourceMessageId).catch(() => null);
            if (sourceMsg) {
              await client.rest
                .delete(Routes.channelMessageOwnReaction(rolesContractId, sourceMessageId, encodeURIComponent('⏳')))
                .catch(() => {});
              await sourceMsg.react('✅').catch(() => {});
            }
          }
        }
        await interaction.reply({
          content: 'Пользователю выдан доступ к каналу с правилами.',
          ephemeral: true,
        }).catch(() => {});
        await interaction.message.edit({ components: [] }).catch(() => {});
        return;
      }

      if (customId === 'contracts_reject' || customId.startsWith('contracts_reject:')) {
        const sourceMessageId = customId.startsWith('contracts_reject:') ? customId.slice('contracts_reject:'.length) : null;
        if (sourceMessageId && rolesContractId) {
          const sourceChannel = await client.channels.fetch(rolesContractId).catch(() => null);
          if (sourceChannel?.isTextBased() && 'messages' in sourceChannel) {
            const sourceMsg = await (sourceChannel as import('discord.js').TextChannel).messages.fetch(sourceMessageId).catch(() => null);
            if (sourceMsg) {
              await client.rest
                .delete(Routes.channelMessageOwnReaction(rolesContractId, sourceMessageId, encodeURIComponent('⏳')))
                .catch(() => {});
              await sourceMsg.react('❌').catch(() => {});
            }
          }
        }
        await interaction.reply({
          content: 'Заявка отклонена.',
          ephemeral: true,
        }).catch(() => {});
        await interaction.message.edit({ components: [] }).catch(() => {});
        return;
      }

      if (customId === 'contracts_agree_rules') {
        const guild = interaction.guild;
        const user = interaction.user;
        if (!guild) return;
        const member = await guild.members.fetch(user.id).catch(() => null);
        if (member) {
          if (rolePendingId) {
            await member.roles.remove(rolePendingId).catch((err) => {
              logger.error(`Contracts: failed to remove pending role: ${err}`);
            });
          }
          if (roleContractsId) {
            await member.roles.add(roleContractsId).catch((err) => {
              logger.error(`Contracts: failed to add contracts role: ${err}`);
            });
          }
        }
        if (logsId) {
          const logsChannel = await client.channels.fetch(logsId).catch(() => null);
          if (logsChannel?.isTextBased() && 'send' in logsChannel) {
            await (logsChannel as import('discord.js').TextChannel).send({
              content: `**Ознакомление с правилами контрактов:** ${user} (${user.tag}) ознакомился с правилами и подписался их соблюдать. Роль «Контракты» выдана.`,
            });
          }
        }
        await interaction.reply({
          content: 'Вам выдана роль **Контракты**. Спасибо за соблюдение правил.',
          ephemeral: true,
        }).catch(() => {});
      }
    });

    client.once(Events.ClientReady, async () => {
      try {
        if (rolesContractId) {
          const rolesCh = await client.channels.fetch(rolesContractId).catch(() => null);
          if (rolesCh?.isTextBased() && 'send' in rolesCh) {
            await ensureApplicationButtonMessage(rolesCh as import('discord.js').TextChannel, client.user!.id);
          }
        }
        if (rulesContractsId) {
          const rulesCh = await client.channels.fetch(rulesContractsId).catch(() => null);
          if (rulesCh?.isTextBased() && 'send' in rulesCh) {
            await ensureRulesMessage(rulesCh as import('discord.js').TextChannel, client.user!.id);
          }
        }
      } catch (e) {
        logger.error(`Contracts: ensure messages failed: ${e}`);
      }
    });
  },
};

export default module;
