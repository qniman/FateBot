export interface InactiveConfig {
  /** ID канала для отправки отчётов */
  reportChannelId: string;
  /** Интервал отправки отчёта в часах */
  reportIntervalHours: number;
  /** ID гильдии для учёта (если не задан, используется гильдия из корневого конфига бота) */
  guildId?: string;
}

export type ActivityEventType = 'message' | 'reaction' | 'voice_join';

export interface ActivityRow {
  userId: string;
  count: number;
}
