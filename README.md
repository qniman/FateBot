# Fate Bot

Extensible Discord bot on Node.js (TypeScript) with a modular core: add features by dropping modules into `modules/` without changing the core.

## Requirements

- Node.js 18+
- A Discord application and bot token ([Discord Developer Portal](https://discord.com/developers/applications))

## Install

```bash
npm install
```

## Configuration

### Discord Developer Portal — Privileged Intents

If you use modules that read messages or members (e.g. **contracts**), enable in the [Developer Portal](https://discord.com/developers/applications) → your application → **Bot** → **Privileged Gateway Intents**:

- **SERVER MEMBERS INTENT** — required for assigning roles (e.g. Контракты).
- **MESSAGE CONTENT INTENT** — required to read message content and attachments (e.g. skills screenshot).

Without these, the bot will fail at login with "Used disallowed intents".

### Environment

1. Copy `.env.example` to `.env`.
2. Set required variables:
   - `DISCORD_TOKEN` — your bot token.
   - `CLIENT_ID` — Application (client) ID (used for slash command registration).
3. Optional:
   - `GUILD_ID` — If set, slash commands are registered only in this server (instant updates, useful for development). If omitted, commands are registered globally (can take up to an hour).
   - `LOG_LEVEL` — `error` | `warn` | `info` | `debug` (default: `info`).

## Run

- Development (watch mode, runs TypeScript with tsx):
  ```bash
  npm run dev
  ```
- Build and production:
  ```bash
  npm run build
  npm start
  ```

## Adding a new module

1. Copy the `modules/template` folder and rename it (e.g. `modules/myfeature`).
2. In the new folder, edit `index.ts`:
   - Set `name` and `version`.
   - In `register(context)` call `context.registerSlashCommand(command, handler)` for each slash command, or `context.registerSlashCommands([...])`.
3. Restart the bot. The loader will pick up the new module and register its commands.

Module contract (in `src/core/types.ts`):

- `name: string` — unique module id.
- `version: string` — version string.
- `register(context: ModuleContext): void | Promise<void>` — receives `context.client`, `context.logger`, `context.config`, and `context.registerSlashCommand` / `context.registerSlashCommands`.

To avoid loading a module, remove or rename its folder (e.g. rename `template` to `_template` if you keep it only as a copy-paste template).

## Project structure

- `src/` — Core: entry point, config, logger, App, ModuleLoader, types.
- `modules/` — Loadable modules; each subfolder with `index.ts` (or `index.js` after build) is one module.

## License

MIT
