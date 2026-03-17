import * as fs from 'node:fs';
import * as path from 'node:path';
import type { ContractsConfig } from './types.js';

const CONFIG_NAME = 'config.json';

function getModuleDir(): string {
  const cwd = process.cwd();
  const possible = [
    path.join(cwd, 'modules', 'contracts'),
    path.join(cwd, 'dist', 'modules', 'contracts'),
  ];
  for (const dir of possible) {
    const p = path.join(dir, CONFIG_NAME);
    if (fs.existsSync(p)) return dir;
  }
  return path.join(cwd, 'modules', 'contracts');
}

export function loadContractsConfig(): ContractsConfig {
  const dir = getModuleDir();
  const configPath = path.join(dir, CONFIG_NAME);
  if (!fs.existsSync(configPath)) {
    throw new Error(`Contracts config not found: ${configPath}. Copy config.example.json to config.json and fill in IDs.`);
  }
  const raw = fs.readFileSync(configPath, 'utf-8');
  const parsed = JSON.parse(raw) as ContractsConfig;
  if (!parsed.channelIds?.rolesContract || !parsed.roleIds?.contracts) {
    throw new Error('Contracts config must have channelIds.rolesContract and roleIds.contracts at minimum.');
  }
  parsed.maxSkillLevel = Number(parsed.maxSkillLevel) || 5;
  parsed.minSumForAutoApprove = Number(parsed.minSumForAutoApprove) ?? 30;
  parsed.ocrConfidenceThreshold = Number(parsed.ocrConfidenceThreshold) ?? 0.55;
  return parsed;
}
