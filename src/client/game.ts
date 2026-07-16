import * as Phaser from 'phaser';
import { ROCKET_PHYSICS } from '../shared/config';
import { MapEditor } from './scenes/MapEditor';
import { TunnelRun } from './scenes/TunnelRun';
import { loadClientChallenge } from './challengeClient';

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: 'game-container',
  backgroundColor: '#071018',
  scale: {
    mode: Phaser.Scale.RESIZE,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: 390,
    height: 844,
  },
  physics: {
    default: 'matter',
    matter: {
      gravity: { x: 0, y: ROCKET_PHYSICS.gravityY },
      debug: false,
    },
  },
  scene: [TunnelRun, MapEditor],
  input: {
    activePointers: 3,
  },
};

document.addEventListener('DOMContentLoaded', async () => {
  await loadClientChallenge();
  new Phaser.Game(config);
});
