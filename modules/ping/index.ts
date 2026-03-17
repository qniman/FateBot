import type { IModule } from '../../src/core/types.js';

const module: IModule = {
  name: 'ping',
  version: '1.0.0',
  register(context) {
    context.registerSlashCommand(
      {
        name: 'ping',
        description: 'Replies with Pong!',
      },
      async (interaction) => {
        await interaction.reply('Pong!');
      }
    );
  },
};

export default module;
