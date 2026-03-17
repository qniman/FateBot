import type { IModule } from '../../src/core/types.js';

/**
 * Template module — copy this folder to create a new module.
 * 1. Rename the folder (e.g. myfeature).
 * 2. Update name and version below.
 * 3. Register slash commands and/or use context.client.on(...) for events.
 */
const module: IModule = {
  name: 'template',
  version: '1.0.0',
  register(context) {
    context.logger.info('Template module registered');

    context.registerSlashCommand(
      {
        name: 'example',
        description: 'Example slash command from template',
      },
      async (interaction) => {
        await interaction.reply('Hello from template module!');
      }
    );
  },
};

export default module;
