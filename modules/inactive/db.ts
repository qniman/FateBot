import initSqlJs, { type Database } from 'sql.js';
import * as path from 'node:path';
import * as fs from 'node:fs';

let db: Database | null = null;
let dbPath: string = '';

function getDbPath(): string {
  if (dbPath) return dbPath;
  const cwd = process.cwd();
  const candidates = [
    path.join(cwd, 'modules', 'inactive', 'inactive.db'),
    path.join(cwd, 'dist', 'modules', 'inactive', 'inactive.db'),
  ];
  for (const p of candidates) {
    const dir = path.dirname(p);
    if (fs.existsSync(dir)) {
      dbPath = p;
      return p;
    }
  }
  dbPath = path.join(process.cwd(), 'modules', 'inactive', 'inactive.db');
  return dbPath;
}

function saveDb(): void {
  if (!db) return;
  const p = getDbPath();
  const dir = path.dirname(p);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const data = db.export();
  fs.writeFileSync(p, Buffer.from(data));
}

export async function initDb(): Promise<Database> {
  if (db) return db;
  const SQL = await initSqlJs({
    locateFile: (file: string) => path.join(process.cwd(), 'node_modules', 'sql.js', 'dist', file),
  });
  const p = getDbPath();
  const dir = path.dirname(p);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (fs.existsSync(p)) {
    const buf = fs.readFileSync(p);
    db = new SQL.Database(buf);
  } else {
    db = new SQL.Database();
  }
  db.run(`
    CREATE TABLE IF NOT EXISTS activity_events (
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      event_type TEXT NOT NULL,
      created_at INTEGER NOT NULL
    )
  `);
  db.run(`CREATE INDEX IF NOT EXISTS idx_activity_guild_time ON activity_events(guild_id, created_at)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_activity_guild_user ON activity_events(guild_id, user_id)`);
  return db;
}

export function insertEvent(
  guildId: string,
  userId: string,
  eventType: 'message' | 'reaction' | 'voice_join'
): void {
  if (!db) return;
  db.run(
    'INSERT INTO activity_events (guild_id, user_id, event_type, created_at) VALUES (?, ?, ?, ?)',
    [guildId, userId, eventType, Math.floor(Date.now() / 1000)]
  );
  saveDb();
}

function escapeSql(str: string): string {
  return str.replace(/'/g, "''");
}

export function getTopActive(
  guildId: string,
  sinceTs: number,
  limit: number
): { userId: string; count: number }[] {
  if (!db) return [];
  const safeGuild = escapeSql(guildId.replace(/[^0-9]/g, '') || '0');
  const safeSince = Math.floor(Number(sinceTs)) || 0;
  const safeLimit = Math.min(100, Math.max(1, limit));
  const result = db.exec(
    `SELECT user_id, COUNT(*) as count FROM activity_events WHERE guild_id = '${safeGuild}' AND created_at >= ${safeSince} GROUP BY user_id ORDER BY count DESC LIMIT ${safeLimit}`
  );
  if (result.length === 0) return [];
  const { columns, values } = result[0];
  const userIdIdx = columns.indexOf('user_id');
  const countIdx = columns.indexOf('count');
  return values.map((row: (string | number)[]) => ({ userId: String(row[userIdIdx]), count: Number(row[countIdx]) }));
}

export function getTopInactive(
  guildId: string,
  sinceTs: number,
  limit: number
): { userId: string; count: number }[] {
  if (!db) return [];
  const safeGuild = escapeSql(guildId.replace(/[^0-9]/g, '') || '0');
  const safeSince = Math.floor(Number(sinceTs)) || 0;
  const safeLimit = Math.min(100, Math.max(1, limit));
  const result = db.exec(
    `SELECT user_id, COUNT(*) as count FROM activity_events WHERE guild_id = '${safeGuild}' AND created_at >= ${safeSince} GROUP BY user_id ORDER BY count ASC LIMIT ${safeLimit}`
  );
  if (result.length === 0) return [];
  const { columns, values } = result[0];
  const userIdIdx = columns.indexOf('user_id');
  const countIdx = columns.indexOf('count');
  return values.map((row: (string | number)[]) => ({ userId: String(row[userIdIdx]), count: Number(row[countIdx]) }));
}
