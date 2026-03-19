import * as fs from 'node:fs';
import * as path from 'node:path';
import type { InactiveConfig } from './types.js';

const CONFIG_NAME = 'config.json';

function getModuleDir(): string {
  const cwd = process.cwd();
  const possible = [
    path.join(cwd, 'modules', 'inactive'),
    path.join(cwd, 'dist', 'modules', 'inactive'),
  ];
  for (const dir of possible) {
    const p = path.join(dir, CONFIG_NAME);
    if (fs.existsSync(p)) return dir;
  }
  return path.join(cwd, 'modules', 'inactive');
}

export function loadInactiveConfig(): InactiveConfig | null {
  const dir = getModuleDir();
  const configPath = path.join(dir, CONFIG_NAME);
  if (!fs.existsSync(configPath)) return null;
  const raw = fs.readFileSync(configPath, 'utf-8');
  const parsed = JSON.parse(raw) as InactiveConfig;
  if (!parsed.reportChannelId?.trim()) return null;
  parsed.reportIntervalHours = Number(parsed.reportIntervalHours) || 24;
  return parsed;
}
