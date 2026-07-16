import { GameObjects, Scene } from 'phaser';
import type { BootstrapResponse } from '../../shared/api';
import { APP_NAME } from '../../shared/config';
import { validateShaftMap } from '../../shared/map';

export class Foundation extends Scene {
  private statusText: GameObjects.Text | undefined;

  constructor() {
    super('Foundation');
  }

  create(): void {
    this.cameras.main.setBackgroundColor(0x071018);
    this.statusText = this.add
      .text(
        this.scale.width / 2,
        this.scale.height / 2,
        `${APP_NAME}\nConnecting to Devvit…`,
        {
          align: 'center',
          color: '#e8f4ff',
          fontFamily: 'system-ui, sans-serif',
          fontSize: '26px',
          lineSpacing: 10,
        }
      )
      .setOrigin(0.5);

    this.scale.on('resize', () => this.layout());
    void this.loadFoundation();
  }

  private layout(): void {
    this.cameras.resize(this.scale.width, this.scale.height);
    this.statusText?.setPosition(this.scale.width / 2, this.scale.height / 2);
  }

  private async loadFoundation(): Promise<void> {
    try {
      const response = await fetch('/api/bootstrap');
      if (!response.ok)
        throw new Error(`Bootstrap returned ${response.status}.`);
      const data: BootstrapResponse = await response.json();
      const validation = validateShaftMap(data.map);
      if (!validation.valid) throw new Error(validation.errors.join(' '));

      this.statusText?.setText(
        `${APP_NAME}\nFoundation connected\n${data.map.points.length} map nodes | Matter ready`
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unknown bootstrap error.';
      this.statusText?.setText(`${APP_NAME}\nFoundation offline\n${message}`);
    }
  }
}
