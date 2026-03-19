import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  type TextChannel,
  type Message,
  type User,
} from 'discord.js';
import type { ContractsConfig, SkillsParseResult } from './types.js';
import type { FormParseResult } from './formSkills.js';
import { MODAL_SKILL_LABELS } from './formSkills.js';

const BUTTON_APPROVE_ID = 'contracts_approve';
const BUTTON_REJECT_ID = 'contracts_reject';
export const BUTTON_APPLY_MODAL_ID = 'contracts_apply_modal';
const MODAL_PREFIX = 'contracts_modal_';
const MODAL_NEXT_PREFIX = 'contracts_next_';
export const MODAL_FIELD_PASSPORT = 'contracts_p';
const MODAL_FIELD_SKILL_PREFIX = 'contracts_s';
const MODAL_FIELD_EPSILON = 'contracts_eps';

/** Step 0: passport + skills 0-3. Steps 1-4: 5 skills each. Step 5: Epsilon only. */
const MODAL_STEPS = 6;
const FIELDS_PER_STEP = [5, 5, 5, 5, 5, 1] as const;

function getFieldIdForSkillIndex(i: number): string {
  return i < 24 ? `${MODAL_FIELD_SKILL_PREFIX}${i}` : MODAL_FIELD_EPSILON;
}

function getLabelsForStep(step: number): string[] {
  if (step === 0) return ['Номер паспорта', ...MODAL_SKILL_LABELS.slice(0, 4)];
  if (step === 5) return [MODAL_SKILL_LABELS[24]];
  const start = 4 + (step - 1) * 5;
  return MODAL_SKILL_LABELS.slice(start, start + 5) as string[];
}

function getPlaceholderByLabel(label: string): string {
  const byLabel: Record<string, string> = {
    'Номер паспорта': '1234567',
    'Сила': '0-5',
    'Стрельба': '0-10',
    'Кулинария': '0-5',
    'Рыболовство': '0-6',
    'Охота': '0-5',
    'Поиск сокровищ': '0-5',
    'Фермерство': '0-5',
    'Строитель': '0-5',
    'Шахтер': '0-5',
    'Шахтёр': '0-5',
    'Грузчик': '0-5',
    'Таксист': '0-5',
    'Дайвер': '0-5',
    'Инкассатор': '0-5',
    'Водитель автобуса': '0-5',
    'Механик': '0-5',
    'Пожарный': '0-5',
    'Дальнобойщик': '0-5',
    'Курьер': '0-5',
    'Подрядчик': '0-5',
    'Почтальон': '0-5',
    'Rednecks': '0-5',
    'Car Meet': '0-5',
    'Merryweather': '0-5',
    'Marrywether': '0-5',
    'Мотоклуб': '0-4',
    'Наличие клуба Epsilon': 'Да / Нет',
  };
  return byLabel[label] ?? '0-5';
}

export function getFieldIdsForStep(step: number): string[] {
  if (step === 0) return [MODAL_FIELD_PASSPORT, ...Array.from({ length: 4 }, (_, i) => getFieldIdForSkillIndex(i))];
  if (step === 5) return [MODAL_FIELD_EPSILON];
  const start = 4 + (step - 1) * 5;
  return Array.from({ length: 5 }, (_, i) => getFieldIdForSkillIndex(start + i));
}

/** For step 0: [-1, 0,1,2,3] (passport = -1). Step 1: [4..8]. Step 5: [24]. */
export function getSkillIndicesForStep(step: number): number[] {
  if (step === 0) return [-1, 0, 1, 2, 3];
  if (step === 5) return [24];
  const start = 4 + (step - 1) * 5;
  return Array.from({ length: 5 }, (_, i) => start + i);
}

export function buildRejectTicketEmbed(
  user: User,
  messageContent: string,
  imageUrl: string,
  reason: string
): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(0xff_00_00)
    .setTitle('Требуется ручная проверка')
    .setDescription(
      `Бот не смог однозначно распознать навыки. Проверьте заявку вручную.`
    )
    .addFields(
      { name: 'Пользователь', value: `${user} (${user.tag})`, inline: true },
      { name: 'Причина', value: reason, inline: true },
      { name: 'Текст заявки', value: messageContent.slice(0, 1000) || '—', inline: false }
    )
    .setImage(imageUrl)
    .setTimestamp();
}

export function buildRejectTicketEmbedFromForm(formSummary: string, reason: string): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(0xff_00_00)
    .setTitle('Анкета: не удалось посчитать навыки')
    .setDescription(reason)
    .addFields({ name: 'Фрагмент анкеты', value: formSummary.slice(0, 1000) || '—', inline: false })
    .setTimestamp();
}

export function buildApprovalTicketEmbed(
  user: User,
  messageContent: string,
  imageUrl: string,
  result: SkillsParseResult & { success: true }
): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(0x00_ff_00)
    .setTitle('Заявка на роль «Контракты»')
    .setDescription(
      `Пользователь хочет зарегистрироваться как исполнитель контрактов. Сумма навыков: **${result.sum}** (уровни: ${result.levels.join(', ')}).`
    )
    .addFields(
      { name: 'Пользователь', value: `${user} (${user.tag})`, inline: true },
      { name: 'Содержание заявки', value: messageContent.slice(0, 1000) || '—', inline: false }
    )
    .setImage(imageUrl)
    .setTimestamp();
}

export function buildApprovalTicketEmbedFromForm(
  formSummary: string,
  result: FormParseResult & { success: true }
): EmbedBuilder {
  const userLine = result.userId
    ? `Участник: <@${result.userId}>`
    : 'Участник: см. анкету выше';
  return new EmbedBuilder()
    .setColor(0x00_ff_00)
    .setTitle('Заявка на роль «Контракты» (анкета)')
    .setDescription(
      `Сумма навыков из анкеты: **${result.sum}** (значения выше 5 считаются как 5; уровни: ${result.levels.join(', ')}).\n${userLine}`
    )
    .addFields(
      { name: 'Фрагмент анкеты', value: formSummary.slice(0, 1000) || '—', inline: false }
    )
    .setTimestamp();
}

export function buildApproveButton(userId: string): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`${BUTTON_APPROVE_ID}:${userId}`)
      .setLabel('Выдать доступ к правилам')
      .setStyle(ButtonStyle.Success)
  );
}

export function buildRejectButton(userId: string): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`${BUTTON_REJECT_ID}:${userId}`)
      .setLabel('Отказать')
      .setStyle(ButtonStyle.Danger)
  );
}

/** Один ряд кнопок: «Выдать доступ» и «Отказать» (messageId — для реакции на исходное сообщение в roles-contract). */
export function buildApprovalTicketRow(userId: string, sourceMessageId?: string): ActionRowBuilder<ButtonBuilder> {
  const approveId = sourceMessageId ? `${BUTTON_APPROVE_ID}:${userId}:${sourceMessageId}` : `${BUTTON_APPROVE_ID}:${userId}`;
  const rejectId = sourceMessageId ? `${BUTTON_REJECT_ID}:${sourceMessageId}` : `${BUTTON_REJECT_ID}:${userId}`;
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(approveId)
      .setLabel('Выдать доступ к правилам')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(rejectId)
      .setLabel('Отказать')
      .setStyle(ButtonStyle.Danger)
  );
}

/** Только кнопка «Отказать» для тикета без Discord ID в анкете. */
export function buildRejectOnlyRow(sourceMessageId?: string): ActionRowBuilder<ButtonBuilder> {
  const rejectId = sourceMessageId ? `${BUTTON_REJECT_ID}:${sourceMessageId}` : BUTTON_REJECT_ID;
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(rejectId)
      .setLabel('Отказать')
      .setStyle(ButtonStyle.Danger)
  );
}

export function buildRulesAgreeButton(): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId('contracts_agree_rules')
      .setLabel('Я ознакомился с правилами и обязуюсь их соблюдать')
      .setStyle(ButtonStyle.Primary)
  );
}

export async function sendRejectTicket(
  channel: TextChannel,
  user: User,
  messageContent: string,
  imageUrl: string,
  reason: string
): Promise<Message | null> {
  const embed = buildRejectTicketEmbed(user, messageContent, imageUrl, reason);
  return channel.send({ embeds: [embed] });
}

export async function sendRejectTicketFromForm(
  channel: TextChannel,
  formSummary: string,
  reason: string
): Promise<Message | null> {
  const embed = buildRejectTicketEmbedFromForm(formSummary, reason);
  return channel.send({ embeds: [embed] });
}

export async function sendApprovalTicket(
  channel: TextChannel,
  user: User,
  messageContent: string,
  imageUrl: string,
  result: SkillsParseResult & { success: true }
): Promise<Message | null> {
  const embed = buildApprovalTicketEmbed(user, messageContent, imageUrl, result);
  const row = buildApprovalTicketRow(user.id);
  return channel.send({ embeds: [embed], components: [row] });
}

export function buildAutoApprovedTicketEmbedFromForm(
  formSummary: string,
  result: FormParseResult & { success: true }
): EmbedBuilder {
  const userLine = result.userId
    ? `Участник: <@${result.userId}>`
    : 'Участник: см. анкету выше';
  return new EmbedBuilder()
    .setColor(0x00_ff_00)
    .setTitle('Заявка на роль «Контракты» — автоодобрено')
    .setDescription(
      `Сумма навыков: **${result.sum}** (≥ порога). Доступ к правилам выдан автоматически.\n${userLine}`
    )
    .addFields(
      { name: 'Фрагмент анкеты', value: formSummary.slice(0, 1000) || '—', inline: false }
    )
    .setTimestamp();
}

export async function sendAutoApprovedTicketFromForm(
  channel: TextChannel,
  formSummary: string,
  result: FormParseResult & { success: true }
): Promise<Message | null> {
  const embed = buildAutoApprovedTicketEmbedFromForm(formSummary, result);
  return channel.send({ embeds: [embed] });
}

export async function sendApprovalTicketFromForm(
  channel: TextChannel,
  formSummary: string,
  result: FormParseResult & { success: true },
  sourceChannelId?: string,
  sourceMessageId?: string
): Promise<Message | null> {
  const embed = buildApprovalTicketEmbedFromForm(formSummary, result);
  if (result.userId) {
    const row = buildApprovalTicketRow(result.userId, sourceMessageId);
    return channel.send({ embeds: [embed], components: [row] });
  }
  const row = buildRejectOnlyRow(sourceMessageId);
  return channel.send({ embeds: [embed], components: [row] });
}

export function buildApplyButton(): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(BUTTON_APPLY_MODAL_ID)
      .setLabel('Подать заявку')
      .setStyle(ButtonStyle.Primary)
  );
}

export function getModalStepId(step: number): string {
  return `${MODAL_PREFIX}${step}`;
}

export function getModalNextButtonId(step: number): string {
  return `${MODAL_NEXT_PREFIX}${step}`;
}

export function isModalNextButton(customId: string): boolean {
  return customId.startsWith(MODAL_NEXT_PREFIX);
}

export function getModalNextStep(customId: string): number {
  return parseInt(customId.slice(MODAL_NEXT_PREFIX.length), 10) || 0;
}

export function getStepFromModalId(customId: string): number {
  return customId.startsWith(MODAL_PREFIX) ? parseInt(customId.slice(MODAL_PREFIX.length), 10) || 0 : -1;
}

export const MODAL_TOTAL_STEPS = MODAL_STEPS;

export function buildModalForStep(step: number): ModalBuilder {
  const title = `Заявка «Контракты» (${step + 1}/${MODAL_STEPS})`;
  const labels = getLabelsForStep(step);
  const ids = getFieldIdsForStep(step);
  const modal = new ModalBuilder().setCustomId(getModalStepId(step)).setTitle(title);
  for (let i = 0; i < labels.length; i++) {
    const isEpsilon = ids[i] === MODAL_FIELD_EPSILON;
    const placeholder = getPlaceholderByLabel(labels[i]);
    const row = new ActionRowBuilder<TextInputBuilder>().addComponents(
      new TextInputBuilder()
        .setCustomId(ids[i])
        .setLabel(labels[i].slice(0, 45))
        .setStyle(TextInputStyle.Short)
        .setRequired(!isEpsilon)
        .setMaxLength(20)
        .setPlaceholder(placeholder)
    );
    modal.addComponents(row);
  }
  return modal;
}

export function buildNextButton(step: number): ActionRowBuilder<ButtonBuilder> {
  const label = step < MODAL_STEPS - 2 ? 'Далее' : 'Отправить';
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(getModalNextButtonId(step))
      .setLabel(label)
      .setStyle(ButtonStyle.Primary)
  );
}

export async function ensureApplicationButtonMessage(
  channel: TextChannel,
  clientUserId: string
): Promise<string | null> {
  const messages = await channel.messages.fetch({ limit: 50 });
  for (const [, msg] of messages) {
    if (msg.author?.id !== clientUserId) continue;
    for (const row of msg.components) {
      const hasButton = 'components' in row && row.components.some(
        (c) => 'customId' in c && c.customId === BUTTON_APPLY_MODAL_ID
      );
      if (hasButton) return msg.id;
    }
  }
  const row = buildApplyButton();
  const sent = await channel.send({
    content: 'Нажмите кнопку ниже, чтобы подать заявку на роль **Контракты**.',
    components: [row],
  });
  return sent.id;
}

export async function ensureRulesMessage(
  channel: TextChannel,
  clientUserId: string
): Promise<string | null> {
  const messages = await channel.messages.fetch({ limit: 50 });
  for (const [, msg] of messages) {
    if (msg.author?.id !== clientUserId) continue;
    for (const row of msg.components) {
      const hasButton = 'components' in row && row.components.some(
        (c) => 'customId' in c && c.customId === 'contracts_agree_rules'
      );
      if (hasButton) return msg.id;
    }
  }
  const row = buildRulesAgreeButton();
  const sent = await channel.send({
    content: 'Нажмите кнопку ниже, чтобы подтвердить ознакомление с правилами и получить роль **Контракты**.',
    components: [row],
  });
  return sent.id;
}
