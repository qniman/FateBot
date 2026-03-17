import type { Embed } from 'discord.js';

/** Skill names in order (for modal steps). Last is Epsilon. */
export const SKILL_NAMES = [
  'Сила',
  'Стрельба',
  'Кулинария',
  'Рыболовство',
  'Охота',
  'Поиск сокровищ',
  'Фермерство',
  'Строитель',
  'Шахтер',
  'Грузчик',
  'Таксист',
  'Дайвер',
  'Инкассатор',
  'Водитель автобуса',
  'Механик',
  'Пожарный',
  'Дальнобойщик',
  'Курьер',
  'Почтальон',
  'Подрядчик',
  'Мотоклуб',
  'Rednecks',
  'Car Meet',
  'Marrywether',
] as const;

export const EPSILON_FIELD = 'Наличие клуба Epsilon';

/** All 25 labels: 24 skills + Epsilon (for modal fields) */
export const MODAL_SKILL_LABELS: readonly string[] = [...SKILL_NAMES, EPSILON_FIELD];

export type FormParseResult =
  | {
      success: true;
      sum: number;
      levels: number[];
      /** Discord user ID if found in embed (e.g. <@123> or Discord ID field) */
      userId?: string;
    }
  | {
      success: false;
      reason: 'no_embed' | 'no_skills_parsed';
    };

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Extract full text from an embed (description + field names and values).
 */
function getEmbedText(embed: Embed): string {
  const parts: string[] = [];
  if (embed.description) parts.push(embed.description);
  for (const field of embed.fields) {
    parts.push(`${field.name}- ${field.value}`);
  }
  return parts.join('\n');
}

/** Normalize for comparison: trim, lowercase (for optional case-insensitive match) */
function norm(s: string): string {
  return s.trim().toLowerCase();
}

/**
 * Parse skill value. Valid: only digits 0–10. >10 or text → 0. 0–5 as is, 6–10 cap at maxLevel (5).
 * Epsilon: "Да" → 1, else 0.
 */
function parseSkillValue(name: string, value: string, maxLevel: number): number {
  const v = value.trim();
  if (name === EPSILON_FIELD) {
    return /^да$/i.test(v) ? 1 : 0;
  }
  if (!/^\d+$/.test(v)) return 0;
  const num = parseInt(v, 10);
  if (num > 10 || num < 0) return 0;
  return Math.min(num, maxLevel);
}

/**
 * Parse 25 modal field values (24 skills + Epsilon) into levels and sum.
 * Order must match MODAL_SKILL_LABELS.
 */
export function parseSkillsFromModalValues(
  skillValues: string[],
  maxLevel: number
): { levels: number[]; sum: number } {
  const levels: number[] = [];
  for (let i = 0; i < MODAL_SKILL_LABELS.length; i++) {
    const name = MODAL_SKILL_LABELS[i];
    const raw = skillValues[i] ?? '';
    levels.push(parseSkillValue(name, raw, maxLevel));
  }
  const sum = levels.reduce((a, b) => a + b, 0);
  return { levels, sum };
}

/**
 * Find "skillName separator value" — separator can be -, :, spaces, en/em dash.
 * Returns the value part (trimmed) or null.
 */
function extractField(text: string, skillName: string): string | null {
  const regex = new RegExp(
    `${escapeRegex(skillName)}[\\s\\-:\\u2013\\u2014\\uFF1A]+([^\\n\\r]+)`,
    'iu'
  );
  const m = text.match(regex);
  if (!m) return null;
  return m[1].trim();
}

/** Separator between label and value: "-", ":", spaces, full-width colon */
const LABEL_VALUE_SEP = '[\\s\\-:\\uFF1A\u00A0]+';

/** Strip BOM and zero-width chars, normalize spaces */
function normalizeLine(s: string): string {
  return s
    .replace(/^\s*[\uFEFF\u200B-\u200D\u2060]*|[\u200B-\u200D\u2060\uFEFF]*\s*$/g, '')
    .trim();
}

/**
 * Try to fix mojibake (e.g. ╨с╨╕╨╗╨░ → Сила).
 * Tries: (1) already has Cyrillic; (2) UTF-8 bytes as UTF-16LE; (3) Latin1 as UTF-16LE;
 * (4) pairs of chars as UTF-16LE code units (wrong decoding of UTF-16 as UTF-8).
 */
function tryFixEncoding(text: string): string {
  const hasCyrillic = (s: string) => /[а-яА-ЯёЁ]/.test(s) || s.includes('Сила');
  if (hasCyrillic(text)) return text;
  try {
    const asUtf16 = Buffer.from(text, 'utf8').toString('utf16le');
    if (hasCyrillic(asUtf16)) return asUtf16;
  } catch {
    // ignore
  }
  try {
    const asLatin1ThenUtf16 = Buffer.from(text, 'latin1').toString('utf16le');
    if (hasCyrillic(asLatin1ThenUtf16)) return asLatin1ThenUtf16;
  } catch {
    // ignore
  }
  try {
    const codeUnits: number[] = [];
    for (let i = 0; i + 1 < text.length; i += 2) {
      codeUnits.push(text.charCodeAt(i) + (text.charCodeAt(i + 1) << 8));
    }
    if (text.length % 2 !== 0) codeUnits.push(text.charCodeAt(text.length - 1));
    const fromPairs = String.fromCharCode(...codeUnits);
    if (hasCyrillic(fromPairs)) return fromPairs;
  } catch {
    // ignore
  }
  return text;
}

/**
 * Parse text line by line: "SkillName: 1" or "Сила: 1" (with optional spaces/trailing).
 * Handles when the whole form is one block (e.g. one embed field value).
 */
function parseTextByLines(text: string, maxLevel: number): number[] {
  const levels: number[] = [];
  const fixed = tryFixEncoding(text);
  const normalized = fixed.normalize('NFC');
  const lines = normalized.split(/\r?\n/).map((l) => normalizeLine(l.replace(/\*\*/g, '')));
  for (const line of lines) {
    if (!line) continue;
    for (const name of SKILL_NAMES) {
      const re = new RegExp(`^\\s*${escapeRegex(name)}${LABEL_VALUE_SEP}(\\d+)`, 'iu');
      const m = line.match(re);
      if (m) {
        levels.push(parseSkillValue(name, m[1], maxLevel));
        break;
      }
    }
    const epsRe = new RegExp(`^\\s*${escapeRegex(EPSILON_FIELD)}${LABEL_VALUE_SEP}(Да|Нет|да|нет)`, 'iu');
    const em = line.match(epsRe);
    if (em) {
      levels.push(/^да$/i.test(em[1].trim()) ? 1 : 0);
    }
  }
  return levels;
}

/**
 * Extract Discord user ID from embed text (first <@123456789> or numeric ID in "Discord ID" field).
 */
function extractUserId(text: string): string | undefined {
  const mentionMatch = text.match(/<@(\d+)>/);
  if (mentionMatch) return mentionMatch[1];
  const discordIdMatch = text.match(/(?:Discord\s*ID|Discord ID)\s*[:\s-]*(\d{17,20})/i);
  if (discordIdMatch) return discordIdMatch[1];
  return undefined;
}

/**
 * Parse a Google Form embed and return sum of skills (each capped at maxLevel).
 * Epsilon "Да" = 1, else 0. Only the listed skill fields are summed.
 * Uses embed.fields by name first (webhook often sends name=question, value=answer), then description text.
 */
export function parseSkillsFromFormEmbed(
  embed: Embed,
  options: { maxSkillLevel?: number } = {}
): FormParseResult {
  const maxLevel = options.maxSkillLevel ?? 5;
  let text = getEmbedText(embed);
  text = tryFixEncoding(text);
  if (!text.trim()) return { success: false, reason: 'no_embed' };

  const levels: number[] = [];
  const skillNamesNorm = new Map(SKILL_NAMES.map((s) => [norm(s), s]));
  const epsilonNorm = norm(EPSILON_FIELD);

  for (const field of embed.fields) {
    const nameNorm = norm(field.name);
    const skillName = skillNamesNorm.get(nameNorm);
    if (skillName) {
      levels.push(parseSkillValue(skillName, field.value, maxLevel));
    } else if (nameNorm === epsilonNorm) {
      levels.push(parseSkillValue(EPSILON_FIELD, field.value, maxLevel));
    }
  }

  if (levels.length === 0) {
    const byLines = parseTextByLines(text, maxLevel);
    if (byLines.length > 0) {
      levels.push(...byLines);
    }
    if (levels.length === 0) {
      for (const name of SKILL_NAMES) {
        const value = extractField(text, name);
        if (value !== null) {
          levels.push(parseSkillValue(name, value, maxLevel));
        }
      }
      const epsilonValue = extractField(text, EPSILON_FIELD);
      if (epsilonValue !== null) {
        levels.push(parseSkillValue(EPSILON_FIELD, epsilonValue, maxLevel));
      }
    }
  }

  if (levels.length === 0) {
    return { success: false, reason: 'no_skills_parsed' };
  }

  const sum = levels.reduce((a, b) => a + b, 0);
  const userId = extractUserId(text);

  return {
    success: true,
    sum,
    levels,
    userId,
  };
}

/**
 * Parse plain text (e.g. message.content) line by line. Use when form is not in an embed.
 */
export function parseSkillsFromText(
  text: string,
  options: { maxSkillLevel?: number } = {}
): FormParseResult {
  const maxLevel = options.maxSkillLevel ?? 5;
  const trimmed = tryFixEncoding(text.trim());
  if (!trimmed) return { success: false, reason: 'no_embed' };

  const levels = parseTextByLines(trimmed, maxLevel);
  if (levels.length === 0) return { success: false, reason: 'no_skills_parsed' };

  const sum = levels.reduce((a, b) => a + b, 0);
  const userId = extractUserId(trimmed);
  return { success: true, sum, levels, userId };
}
