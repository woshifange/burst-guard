/**
 * 覆盖层场景：回合横幅 / 猝死提示 / 全屏闪光。使用屏幕坐标，不参与模拟。
 */

import Phaser from 'phaser';
import type { AppContext } from '../app-context';

const FONT = 'system-ui, -apple-system, "Noto Sans SC", sans-serif';

export class OverlayScene extends Phaser.Scene {
  private banner!: Phaser.GameObjects.Text;
  private sub!: Phaser.GameObjects.Text;
  private flashRect!: Phaser.GameObjects.Rectangle;

  constructor(private app: AppContext) {
    super('OverlayScene');
  }

  create(): void {
    this.banner = this.add
      .text(0, 0, '', {
        fontFamily: FONT,
        fontSize: '40px',
        fontStyle: 'bold',
        color: '#ffd166',
        stroke: '#160b02',
        strokeThickness: 6,
      })
      .setOrigin(0.5)
      .setDepth(100)
      .setAlpha(0);
    this.sub = this.add
      .text(0, 0, '', { fontFamily: FONT, fontSize: '15px', color: '#dbe6f7', stroke: '#0a0f1e', strokeThickness: 3 })
      .setOrigin(0.5)
      .setDepth(100)
      .setAlpha(0);
    this.flashRect = this.add.rectangle(0, 0, 10, 10, 0xfff2cc, 0).setOrigin(0, 0).setDepth(99);
    this.layout();
    this.scale.on('resize', this.layout, this);
    void this.app;
  }

  private layout(): void {
    const w = this.scale.width;
    const h = this.scale.height;
    this.banner.setPosition(w / 2, h * 0.33);
    this.sub.setPosition(w / 2, h * 0.44);
    this.flashRect.setSize(w, h);
  }

  showBanner(text: string, color = '#ffd166', sub = '', duration = 1100): void {
    if (!this.banner) return;
    this.banner.setText(text).setColor(color).setAlpha(0).setScale(0.86).setY(this.scale.height * 0.36);
    this.sub.setText(sub).setAlpha(0);
    this.tweens.killTweensOf(this.banner);
    this.tweens.killTweensOf(this.sub);
    this.tweens.add({ targets: this.banner, alpha: 1, scale: 1, y: this.scale.height * 0.33, duration: 220, ease: 'Back.easeOut' });
    this.tweens.add({ targets: this.banner, alpha: 0, duration: 420, delay: duration, ease: 'Quad.easeIn' });
    if (sub) {
      this.tweens.add({ targets: this.sub, alpha: 1, duration: 220 });
      this.tweens.add({ targets: this.sub, alpha: 0, duration: 420, delay: duration });
    }
  }

  screenFlash(color = 0xfff2cc, alpha = 0.18, duration = 160): void {
    this.flashRect.setFillStyle(color, alpha);
    this.flashRect.setAlpha(0);
    this.tweens.add({ targets: this.flashRect, alpha: { from: 1, to: 0 }, duration });
  }
}
