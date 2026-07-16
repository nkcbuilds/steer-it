import Phaser, { GameObjects, Scene } from 'phaser';
import type { RunSnapshot } from './RunController';
import {
  ensureUiAssets,
  RESULTS_PANEL_NATIVE,
  RESULTS_PANEL_TEXTURE,
} from './uiAssets';

export type RunHudCallbacks = {
  onRetry: () => void;
  onEdit?: () => void;
  onBackToEditor?: () => void;
  /** Optional secondary action on completion (Continue / Leaderboard). */
  onContinue?: () => void;
};

export type HudRect = { x: number; y: number; w: number; h: number };

export type CompletionResultInfo = {
  timeSeconds: number;
  fuelUsed: number;
  fuelLimit: number;
  statusText: string;
  isPersonalBest?: boolean;
};

export type CrashResultInfo = {
  timeSeconds: number;
  fuelUsed: number;
  statusText?: string;
};

const FONT =
  'ui-monospace, SFMono-Regular, Menlo, Consolas, "Courier New", monospace';
const TUTORIAL_MS = 5000;
const TUTORIAL_STORAGE_KEY = 'steer-it-first-run-tutorial-v1';
const TUTORIAL_REMINDER_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Compact themed instrument HUD + results overlay for tunnel runs.
 * Instrument strip stays minimal; terminal states open the results panel art
 * with code-rendered stats and action buttons.
 */
export class RunHud {
  private readonly scene: Scene;
  private readonly callbacks: RunHudCallbacks;

  private readonly instrumentRoot: GameObjects.Container;
  private readonly instrumentBg: GameObjects.Graphics;
  private readonly stateLabel: GameObjects.Text;
  private readonly timeLabel: GameObjects.Text;
  private readonly netLabel: GameObjects.Text;
  private readonly fuelCaption: GameObjects.Text;
  private readonly thrCaption: GameObjects.Text;
  private readonly fuelBarBg: GameObjects.Graphics;
  private readonly fuelBarFill: GameObjects.Graphics;
  private readonly thrBarBg: GameObjects.Graphics;
  private readonly thrBarFill: GameObjects.Graphics;

  private readonly editButton: GameObjects.Container;
  private readonly editBg: GameObjects.Graphics;
  private readonly editLabel: GameObjects.Text;
  private readonly backEditorButton: GameObjects.Container;
  private readonly backEditorBg: GameObjects.Graphics;
  private readonly backEditorLabel: GameObjects.Text;

  private readonly resultsRoot: GameObjects.Container;
  private readonly resultsDim: GameObjects.Graphics;
  private readonly resultsPanel: GameObjects.Image;
  private readonly resultsFallback: GameObjects.Graphics;
  private readonly resultsTitle: GameObjects.Text;
  private readonly resultsBody: GameObjects.Text;
  private readonly resultsStatus: GameObjects.Text;
  private readonly primaryButton: GameObjects.Container;
  private readonly primaryBg: GameObjects.Graphics;
  private readonly primaryLabel: GameObjects.Text;
  private readonly secondaryButton: GameObjects.Container;
  private readonly secondaryBg: GameObjects.Graphics;
  private readonly secondaryLabel: GameObjects.Text;

  private readonly tutorialRoot: GameObjects.Container;
  private readonly tutorialBg: GameObjects.Graphics;
  private readonly tutorialText: GameObjects.Text;
  private readonly tutorialCloseBg: GameObjects.Graphics;
  private readonly tutorialCloseLabel: GameObjects.Text;

  private communityStatus = 'PRACTICE';
  private editorTestMode = false;
  private lastThrottle = 0;
  private lastFuelPct = 100;
  private lastSnapshot: RunSnapshot | undefined;
  private resultsMode: 'hidden' | 'crash' | 'complete' = 'hidden';
  private terminalResultsDeferred = false;
  private tutorialTimer: Phaser.Time.TimerEvent | undefined;
  private viewWidth = 390;
  private viewHeight = 844;

  private instrumentBounds: HudRect = { x: 8, y: 8, w: 168, h: 78 };
  private editBounds: HudRect = { x: 0, y: 0, w: 70, h: 32 };
  private backEditorBounds: HudRect = { x: 0, y: 0, w: 84, h: 32 };
  private primaryBounds: HudRect = { x: 0, y: 0, w: 120, h: 40 };
  private secondaryBounds: HudRect = { x: 0, y: 0, w: 120, h: 40 };
  private tutorialBounds: HudRect = { x: 0, y: 0, w: 280, h: 120 };
  private tutorialCloseBounds: HudRect = { x: 0, y: 0, w: 28, h: 28 };
  private resultsPanelBounds: HudRect = { x: 0, y: 0, w: 280, h: 340 };

  constructor(scene: Scene, callbacks: RunHudCallbacks) {
    this.scene = scene;
    this.callbacks = callbacks;

    this.instrumentBg = scene.add.graphics();
    this.fuelBarBg = scene.add.graphics();
    this.fuelBarFill = scene.add.graphics();
    this.thrBarBg = scene.add.graphics();
    this.thrBarFill = scene.add.graphics();

    this.stateLabel = scene.add
      .text(0, 0, 'READY', {
        color: '#8ec8ff',
        fontFamily: FONT,
        fontSize: '11px',
        fontStyle: 'bold',
      })
      .setOrigin(0, 0);
    this.timeLabel = scene.add
      .text(0, 0, '0.0s', {
        color: '#e8f0ff',
        fontFamily: FONT,
        fontSize: '18px',
        fontStyle: 'bold',
      })
      .setOrigin(0, 0);
    this.netLabel = scene.add
      .text(0, 0, 'PRACTICE', {
        color: '#9fb3c8',
        fontFamily: FONT,
        fontSize: '10px',
      })
      .setOrigin(0, 0);
    this.fuelCaption = scene.add
      .text(0, 0, 'FUEL', {
        color: '#5ec8e8',
        fontFamily: FONT,
        fontSize: '9px',
      })
      .setOrigin(0, 0);
    this.thrCaption = scene.add
      .text(0, 0, 'THR', {
        color: '#ffb347',
        fontFamily: FONT,
        fontSize: '9px',
      })
      .setOrigin(0, 0);

    this.instrumentRoot = scene.add
      .container(0, 0, [
        this.instrumentBg,
        this.stateLabel,
        this.timeLabel,
        this.netLabel,
        this.fuelCaption,
        this.thrCaption,
        this.fuelBarBg,
        this.fuelBarFill,
        this.thrBarBg,
        this.thrBarFill,
      ])
      .setScrollFactor(0)
      .setDepth(190);

    this.editBg = scene.add.graphics();
    this.editLabel = scene.add
      .text(0, 0, 'EDIT', {
        color: '#071018',
        fontFamily: FONT,
        fontSize: '11px',
        fontStyle: 'bold',
      })
      .setOrigin(0.5);
    this.editButton = scene.add
      .container(0, 0, [this.editBg, this.editLabel])
      .setScrollFactor(0)
      .setDepth(193)
      .setSize(70, 32);

    this.backEditorBg = scene.add.graphics();
    this.backEditorLabel = scene.add
      .text(0, 0, 'EDITOR', {
        color: '#071018',
        fontFamily: FONT,
        fontSize: '11px',
        fontStyle: 'bold',
      })
      .setOrigin(0.5);
    this.backEditorButton = scene.add
      .container(0, 0, [this.backEditorBg, this.backEditorLabel])
      .setScrollFactor(0)
      .setDepth(193)
      .setVisible(false)
      .setSize(84, 32);

    this.resultsDim = scene.add.graphics();
    this.resultsFallback = scene.add.graphics();
    this.resultsPanel = scene.add
      .image(0, 0, RESULTS_PANEL_TEXTURE)
      .setOrigin(0.5)
      .setVisible(false);
    this.resultsTitle = scene.add
      .text(0, 0, '', {
        color: '#ffe66d',
        fontFamily: FONT,
        fontSize: '20px',
        fontStyle: 'bold',
        align: 'center',
      })
      .setOrigin(0.5, 0);
    this.resultsBody = scene.add
      .text(0, 0, '', {
        color: '#e8f0ff',
        fontFamily: FONT,
        fontSize: '14px',
        align: 'center',
        lineSpacing: 6,
      })
      .setOrigin(0.5, 0);
    this.resultsStatus = scene.add
      .text(0, 0, '', {
        color: '#7dffc8',
        fontFamily: FONT,
        fontSize: '12px',
        align: 'center',
      })
      .setOrigin(0.5, 0);

    this.primaryBg = scene.add.graphics();
    this.primaryLabel = scene.add
      .text(0, 0, 'RETRY', {
        color: '#1a1208',
        fontFamily: FONT,
        fontSize: '13px',
        fontStyle: 'bold',
      })
      .setOrigin(0.5);
    this.primaryButton = scene.add
      .container(0, 0, [this.primaryBg, this.primaryLabel])
      .setSize(120, 40);

    this.secondaryBg = scene.add.graphics();
    this.secondaryLabel = scene.add
      .text(0, 0, 'CONTINUE', {
        color: '#071018',
        fontFamily: FONT,
        fontSize: '12px',
        fontStyle: 'bold',
      })
      .setOrigin(0.5);
    this.secondaryButton = scene.add
      .container(0, 0, [this.secondaryBg, this.secondaryLabel])
      .setSize(120, 40)
      .setVisible(false);

    this.resultsRoot = scene.add
      .container(0, 0, [
        this.resultsDim,
        this.resultsFallback,
        this.resultsPanel,
        this.resultsTitle,
        this.resultsBody,
        this.resultsStatus,
        this.primaryButton,
        this.secondaryButton,
      ])
      .setScrollFactor(0)
      .setDepth(220)
      .setVisible(false);

    this.tutorialBg = scene.add.graphics();
    this.tutorialText = scene.add
      .text(0, 0, '', {
        color: '#e8f4ff',
        fontFamily: FONT,
        fontSize: '12px',
        align: 'left',
        lineSpacing: 4,
        wordWrap: { width: 240 },
      })
      .setOrigin(0, 0);
    this.tutorialCloseBg = scene.add.graphics();
    this.tutorialCloseLabel = scene.add
      .text(0, 0, '×', {
        color: '#e8f4ff',
        fontFamily: FONT,
        fontSize: '18px',
        fontStyle: 'bold',
      })
      .setOrigin(0.5);
    this.tutorialRoot = scene.add
      .container(0, 0, [
        this.tutorialBg,
        this.tutorialText,
        this.tutorialCloseBg,
        this.tutorialCloseLabel,
      ])
      .setScrollFactor(0)
      .setDepth(230)
      .setVisible(false);

    scene.input.on('pointerup', this.onPointerUp, this);

    ensureUiAssets(scene, () => {
      this.refreshResultsPanelTexture();
    });

    this.layout(scene.scale.width, scene.scale.height);
    this.maybeShowFirstRunTutorial();
  }

  /** Compact instrument strip + chrome layout for current viewport. */
  layout(viewWidth: number, viewHeight: number): void {
    this.viewWidth = Math.max(1, viewWidth);
    this.viewHeight = Math.max(1, viewHeight);

    const narrow = this.viewWidth < 420;
    const panelW = narrow ? Math.min(156, this.viewWidth - 88) : 172;
    const panelH = narrow ? 74 : 80;
    this.instrumentBounds = { x: 8, y: 8, w: panelW, h: panelH };
    this.drawInstrumentChrome();

    const pad = 10;
    this.stateLabel.setPosition(
      this.instrumentBounds.x + pad,
      this.instrumentBounds.y + 8
    );
    this.timeLabel.setPosition(
      this.instrumentBounds.x + pad,
      this.instrumentBounds.y + 24
    );
    this.netLabel.setPosition(
      this.instrumentBounds.x + pad + 72,
      this.instrumentBounds.y + 30
    );
    this.thrCaption.setPosition(
      this.instrumentBounds.x + pad,
      this.instrumentBounds.y + 48
    );
    this.fuelCaption.setPosition(
      this.instrumentBounds.x + pad,
      this.instrumentBounds.y + 60
    );

    this.editBounds = {
      x: this.viewWidth - 78,
      y: 8,
      w: 70,
      h: 32,
    };
    this.editButton.setPosition(
      this.editBounds.x + this.editBounds.w / 2,
      this.editBounds.y + this.editBounds.h / 2
    );
    this.drawPixelButton(this.editBg, 70, 32, 0x5ec8e8, 0xb8f0ff);

    this.backEditorBounds = {
      x: this.viewWidth - 92,
      y: 8,
      w: 84,
      h: 32,
    };
    this.backEditorButton.setPosition(
      this.backEditorBounds.x + this.backEditorBounds.w / 2,
      this.backEditorBounds.y + this.backEditorBounds.h / 2
    );
    this.drawPixelButton(this.backEditorBg, 84, 32, 0x2a9d8f, 0x8ef0d8);

    this.editButton.setVisible(!this.editorTestMode);
    this.backEditorButton.setVisible(this.editorTestMode);

    this.layoutResults();
    this.layoutTutorial();
    this.redrawBars();
  }

  setEditorTestMode(enabled: boolean): void {
    this.editorTestMode = enabled;
    this.editButton.setVisible(!enabled);
    this.backEditorButton.setVisible(enabled);
    if (this.resultsMode !== 'hidden') {
      this.layoutResults();
    }
  }

  setCommunityStatus(status: string): void {
    this.communityStatus = status;
    this.netLabel.setText(status);
    if (this.resultsMode === 'complete' && this.lastSnapshot) {
      this.paintCompletionFromSnapshot(this.lastSnapshot);
    } else if (this.resultsMode === 'crash') {
      this.resultsStatus.setText(status);
    }
  }

  /**
   * Drive the live instrument strip. Terminal states auto-open the results
   * overlay so scene code can keep calling update() only.
   */
  update(snapshot: RunSnapshot, throttle: number): void {
    this.lastSnapshot = snapshot;
    const seconds = snapshot.elapsedMs / 1000;
    const fuelPct =
      snapshot.fuelLimit > 0
        ? (snapshot.fuel / snapshot.fuelLimit) * 100
        : 0;

    this.lastThrottle = throttle;
    this.lastFuelPct = fuelPct;

    const stateColor =
      snapshot.state === 'crashed'
        ? '#ff6b8a'
        : snapshot.state === 'completed'
          ? '#7dffc8'
          : snapshot.state === 'running'
            ? '#ffe66d'
            : '#8ec8ff';
    this.stateLabel.setColor(stateColor);
    this.stateLabel.setText(snapshot.state.toUpperCase());
    this.timeLabel.setText(`${seconds.toFixed(1)}s`);
    this.netLabel.setText(this.communityStatus);
    this.redrawBars();

    if (this.terminalResultsDeferred) return;

    if (snapshot.state === 'crashed') {
      if (this.resultsMode !== 'crash') {
        this.showCrashResults({
          timeSeconds: seconds,
          fuelUsed: snapshot.fuelUsed,
          statusText: this.communityStatus,
        });
      }
    } else if (snapshot.state === 'completed') {
      if (this.resultsMode !== 'complete') {
        this.showCompletionResults({
          timeSeconds: seconds,
          fuelUsed: snapshot.fuelUsed,
          fuelLimit: snapshot.fuelLimit,
          statusText: this.communityStatus,
        });
      } else {
        this.paintCompletionFromSnapshot(snapshot);
      }
    } else if (this.resultsMode !== 'hidden') {
      this.hideResults();
    }
  }

  /** First-run coaching card (5s auto-dismiss + close button). */
  showFirstRunTutorial(): void {
    this.tutorialRoot.setVisible(true);
    this.layoutTutorial();
    this.tutorialTimer?.remove(false);
    this.tutorialTimer = this.scene.time.delayedCall(TUTORIAL_MS, () => {
      this.hideTutorial(true);
    });
  }

  hideTutorial(persist = true): void {
    this.tutorialRoot.setVisible(false);
    this.tutorialTimer?.remove(false);
    this.tutorialTimer = undefined;
    if (persist) {
      writeTutorialSeen();
    }
  }

  showCrashResults(info: CrashResultInfo): void {
    this.resultsMode = 'crash';
    this.resultsRoot.setVisible(true);
    this.hideTutorial(false);
    this.resultsTitle.setColor('#ff6b8a');
    this.resultsTitle.setText('CRASHED');
    this.resultsBody.setText(
      [
        `TIME   ${info.timeSeconds.toFixed(1)}s`,
        `FUEL   ${info.fuelUsed.toFixed(0)} used`,
      ].join('\n')
    );
    this.resultsStatus.setColor('#9fb3c8');
    this.resultsStatus.setText(info.statusText ?? this.communityStatus);
    this.primaryLabel.setText('RETRY  [R]');
    this.secondaryButton.setVisible(this.editorTestMode);
    this.secondaryLabel.setText(this.editorTestMode ? 'EDITOR' : 'CONTINUE');
    this.layoutResults();
  }

  showCompletionResults(info: CompletionResultInfo): void {
    this.resultsMode = 'complete';
    this.resultsRoot.setVisible(true);
    this.hideTutorial(false);
    this.resultsTitle.setColor('#7dffc8');
    this.resultsTitle.setText('CLEAR');
    this.paintCompletionInfo(info);
    this.primaryLabel.setText('RETRY  [R]');
    const continueLabel = this.editorTestMode
      ? 'EDITOR'
      : this.callbacks.onContinue
        ? 'LEADERBOARD'
        : 'CONTINUE';
    this.secondaryLabel.setText(continueLabel);
    this.secondaryButton.setVisible(true);
    this.layoutResults();
  }

  hideResults(): void {
    this.resultsMode = 'hidden';
    this.resultsRoot.setVisible(false);
  }

  /** Delay the terminal card while the scene plays the surface escape shot. */
  setTerminalResultsDeferred(deferred: boolean): void {
    this.terminalResultsDeferred = deferred;
    if (deferred) this.hideResults();
  }

  /** Screen-space rects that freehand gimbal / world touches should ignore. */
  getExclusionRects(): HudRect[] {
    const rects: HudRect[] = [this.instrumentBounds];
    if (this.editButton.visible) rects.push(this.editBounds);
    if (this.backEditorButton.visible) rects.push(this.backEditorBounds);
    if (this.tutorialRoot.visible) rects.push(this.tutorialBounds);
    if (this.resultsRoot.visible) {
      rects.push({
        x: 0,
        y: 0,
        w: this.viewWidth,
        h: this.viewHeight,
      });
    }
    return rects;
  }

  isResultsVisible(): boolean {
    return this.resultsMode !== 'hidden';
  }

  destroy(): void {
    this.scene.input.off('pointerup', this.onPointerUp, this);
    this.tutorialTimer?.remove(false);
    this.instrumentRoot.destroy(true);
    this.editButton.destroy(true);
    this.backEditorButton.destroy(true);
    this.resultsRoot.destroy(true);
    this.tutorialRoot.destroy(true);
  }

  private maybeShowFirstRunTutorial(): void {
    if (readTutorialSeen()) return;
    this.showFirstRunTutorial();
  }

  private paintCompletionFromSnapshot(snapshot: RunSnapshot): void {
    this.paintCompletionInfo({
      timeSeconds: snapshot.elapsedMs / 1000,
      fuelUsed: snapshot.fuelUsed,
      fuelLimit: snapshot.fuelLimit,
      statusText: this.communityStatus,
      isPersonalBest: this.communityStatus.startsWith('PB '),
    });
  }

  private paintCompletionInfo(info: CompletionResultInfo): void {
    const fuelLine =
      info.fuelLimit > 0
        ? `FUEL   ${info.fuelUsed.toFixed(0)} / ${info.fuelLimit.toFixed(0)}`
        : `FUEL   ${info.fuelUsed.toFixed(0)} used`;
    this.resultsBody.setText(
      [`TIME   ${info.timeSeconds.toFixed(1)}s`, fuelLine].join('\n')
    );
    const status =
      info.isPersonalBest === true
        ? `PERSONAL BEST · ${info.statusText}`
        : info.statusText;
    this.resultsStatus.setColor(
      info.isPersonalBest === true || info.statusText.startsWith('PB ')
        ? '#ffe66d'
        : '#7dffc8'
    );
    this.resultsStatus.setText(status);
  }

  private layoutResults(): void {
    const maxPanelW = Math.min(300, this.viewWidth - 24);
    const scale = maxPanelW / RESULTS_PANEL_NATIVE.width;
    const panelW = RESULTS_PANEL_NATIVE.width * scale;
    const panelH = RESULTS_PANEL_NATIVE.height * scale;
    const cx = this.viewWidth / 2;
    const cy = this.viewHeight * 0.46;

    this.resultsPanelBounds = {
      x: cx - panelW / 2,
      y: cy - panelH / 2,
      w: panelW,
      h: panelH,
    };

    this.resultsDim.clear();
    this.resultsDim.fillStyle(0x04060c, 0.62);
    this.resultsDim.fillRect(0, 0, this.viewWidth, this.viewHeight);

    this.resultsFallback.clear();
    if (!this.scene.textures.exists(RESULTS_PANEL_TEXTURE)) {
      this.resultsFallback.fillStyle(0x121a24, 0.96);
      this.resultsFallback.fillRect(
        this.resultsPanelBounds.x,
        this.resultsPanelBounds.y,
        panelW,
        panelH
      );
      this.resultsFallback.lineStyle(2, 0x5ec8e8, 0.85);
      this.resultsFallback.strokeRect(
        this.resultsPanelBounds.x,
        this.resultsPanelBounds.y,
        panelW,
        panelH
      );
      this.resultsPanel.setVisible(false);
    } else {
      this.resultsPanel.setTexture(RESULTS_PANEL_TEXTURE);
      this.resultsPanel.setVisible(true);
      this.resultsPanel.setPosition(cx, cy);
      this.resultsPanel.setDisplaySize(panelW, panelH);
    }

    const contentTop = this.resultsPanelBounds.y + panelH * 0.22;
    this.resultsTitle.setPosition(cx, contentTop);
    this.resultsTitle.setFontSize(this.viewWidth < 400 ? '18px' : '20px');
    this.resultsBody.setPosition(cx, contentTop + 36);
    this.resultsBody.setFontSize(this.viewWidth < 400 ? '13px' : '14px');
    this.resultsStatus.setPosition(cx, contentTop + 90);
    this.resultsStatus.setWordWrapWidth(panelW * 0.7);

    const btnW = Math.min(128, panelW * 0.42);
    const btnH = 40;
    const btnY = this.resultsPanelBounds.y + panelH * 0.78;
    const gap = 10;

    if (this.secondaryButton.visible) {
      const pairW = btnW * 2 + gap;
      const leftX = cx - pairW / 2 + btnW / 2;
      const rightX = cx + pairW / 2 - btnW / 2;
      this.primaryBounds = {
        x: leftX - btnW / 2,
        y: btnY - btnH / 2,
        w: btnW,
        h: btnH,
      };
      this.secondaryBounds = {
        x: rightX - btnW / 2,
        y: btnY - btnH / 2,
        w: btnW,
        h: btnH,
      };
      this.primaryButton.setPosition(leftX, btnY);
      this.secondaryButton.setPosition(rightX, btnY);
    } else {
      this.primaryBounds = {
        x: cx - btnW / 2,
        y: btnY - btnH / 2,
        w: btnW,
        h: btnH,
      };
      this.primaryButton.setPosition(cx, btnY);
    }

    this.primaryButton.setSize(btnW, btnH);
    this.secondaryButton.setSize(btnW, btnH);
    this.drawPixelButton(this.primaryBg, btnW, btnH, 0xff9f1c, 0xffe66d);
    this.drawPixelButton(this.secondaryBg, btnW, btnH, 0x5ec8e8, 0xb8f0ff);
  }

  private layoutTutorial(): void {
    const w = Math.min(300, this.viewWidth - 24);
    const h = 118;
    const x = (this.viewWidth - w) / 2;
    const y = Math.max(this.instrumentBounds.y + this.instrumentBounds.h + 10, 96);
    this.tutorialBounds = { x, y, w, h };

    this.tutorialBg.clear();
    this.tutorialBg.fillStyle(0x0a0f18, 0.92);
    this.tutorialBg.fillRect(x, y, w, h);
    this.tutorialBg.lineStyle(2, 0xff9f1c, 0.85);
    this.tutorialBg.strokeRect(x, y, w, h);
    this.tutorialBg.lineStyle(1, 0x5ec8e8, 0.55);
    this.tutorialBg.lineBetween(x + 12, y + 2, x + 48, y + 2);

    this.tutorialText.setWordWrapWidth(w - 48);
    this.tutorialText.setPosition(x + 14, y + 14);
    this.tutorialText.setText(
      [
        'FIRST FLIGHT',
        'W/S or throttle: thrust',
        'A/D or drag screen: gimbal',
        'Reach the surface exit',
      ].join('\n')
    );

    this.tutorialCloseBounds = {
      x: x + w - 34,
      y: y + 8,
      w: 26,
      h: 26,
    };
    this.tutorialCloseBg.clear();
    this.tutorialCloseBg.fillStyle(0x293241, 0.95);
    this.tutorialCloseBg.fillRect(
      this.tutorialCloseBounds.x,
      this.tutorialCloseBounds.y,
      26,
      26
    );
    this.tutorialCloseBg.lineStyle(1, 0x778da9, 1);
    this.tutorialCloseBg.strokeRect(
      this.tutorialCloseBounds.x,
      this.tutorialCloseBounds.y,
      26,
      26
    );
    this.tutorialCloseLabel.setPosition(
      this.tutorialCloseBounds.x + 13,
      this.tutorialCloseBounds.y + 12
    );
  }

  private refreshResultsPanelTexture(): void {
    if (this.resultsMode !== 'hidden') {
      this.layoutResults();
    }
  }

  private drawInstrumentChrome(): void {
    const { x, y, w, h } = this.instrumentBounds;
    this.instrumentBg.clear();
    this.instrumentBg.fillStyle(0x0a0f18, 0.78);
    this.instrumentBg.fillRect(x, y, w, h);
    this.instrumentBg.lineStyle(1, 0x3d4f66, 0.95);
    this.instrumentBg.strokeRect(x, y, w, h);
    this.instrumentBg.lineStyle(2, 0xff9f1c, 0.7);
    this.instrumentBg.lineBetween(x + 8, y + 1, x + 36, y + 1);
    this.instrumentBg.lineStyle(1, 0x5ec8e8, 0.55);
    this.instrumentBg.lineBetween(x + w - 36, y + h - 1, x + w - 8, y + h - 1);
  }

  private redrawBars(): void {
    const { x, y, w } = this.instrumentBounds;
    const barX = x + 42;
    const barW = w - 52;
    const thrY = y + 50;
    const fuelY = y + 62;

    this.fuelBarBg.clear();
    this.thrBarBg.clear();
    this.fuelBarFill.clear();
    this.thrBarFill.clear();

    this.thrBarBg.fillStyle(0x1a2433, 0.95);
    this.thrBarBg.fillRect(barX, thrY, barW, 6);
    this.thrBarBg.lineStyle(1, 0x415a77, 0.8);
    this.thrBarBg.strokeRect(barX, thrY, barW, 6);
    const thrW = (barW - 2) * clamp(this.lastThrottle, 0, 1);
    this.thrBarFill.fillStyle(0xff9f1c, 0.95);
    this.thrBarFill.fillRect(barX + 1, thrY + 1, thrW, 4);

    this.fuelBarBg.fillStyle(0x1a2433, 0.95);
    this.fuelBarBg.fillRect(barX, fuelY, barW, 6);
    this.fuelBarBg.lineStyle(1, 0x415a77, 0.8);
    this.fuelBarBg.strokeRect(barX, fuelY, barW, 6);
    const fuelW = (barW - 2) * clamp(this.lastFuelPct / 100, 0, 1);
    this.fuelBarFill.fillStyle(0x5ec8e8, 0.95);
    this.fuelBarFill.fillRect(barX + 1, fuelY + 1, fuelW, 4);
  }

  private drawPixelButton(
    graphics: GameObjects.Graphics,
    w: number,
    h: number,
    fill: number,
    stroke: number
  ): void {
    graphics.clear();
    graphics.fillStyle(fill, 0.95);
    graphics.fillRect(-w / 2, -h / 2, w, h);
    graphics.lineStyle(2, stroke, 1);
    graphics.strokeRect(-w / 2, -h / 2, w, h);
    graphics.fillStyle(0xffffff, 0.18);
    graphics.fillRect(-w / 2 + 3, -h / 2 + 2, w - 6, 3);
  }

  private onPointerUp(pointer: Phaser.Input.Pointer): void {
    const localX = pointer.x - this.scene.cameras.main.x;
    const localY = pointer.y - this.scene.cameras.main.y;

    if (this.tutorialRoot.visible && hit(this.tutorialCloseBounds, localX, localY)) {
      this.hideTutorial(true);
      return;
    }

    if (this.resultsRoot.visible) {
      if (hit(this.primaryBounds, localX, localY)) {
        this.callbacks.onRetry();
        return;
      }
      if (this.secondaryButton.visible && hit(this.secondaryBounds, localX, localY)) {
        if (this.editorTestMode && this.callbacks.onBackToEditor) {
          this.callbacks.onBackToEditor();
          return;
        }
        if (this.callbacks.onContinue) {
          this.callbacks.onContinue();
          return;
        }
        // Default continue = retry so the run is not dead-ended.
        this.callbacks.onRetry();
        return;
      }
    }

    if (
      this.editButton.visible &&
      hit(this.editBounds, localX, localY) &&
      this.callbacks.onEdit
    ) {
      this.callbacks.onEdit();
      return;
    }

    if (
      this.backEditorButton.visible &&
      hit(this.backEditorBounds, localX, localY) &&
      this.callbacks.onBackToEditor
    ) {
      this.callbacks.onBackToEditor();
    }
  }
}

const hit = (bounds: HudRect, x: number, y: number): boolean =>
  x >= bounds.x &&
  x <= bounds.x + bounds.w &&
  y >= bounds.y &&
  y <= bounds.y + bounds.h;

const clamp = (value: number, minimum: number, maximum: number): number =>
  Math.min(maximum, Math.max(minimum, value));

const readTutorialSeen = (): boolean => {
  try {
    const value = globalThis.localStorage?.getItem(TUTORIAL_STORAGE_KEY);
    if (!value) return false;
    const seenAt = Number(value);
    return Number.isFinite(seenAt) && Date.now() - seenAt < TUTORIAL_REMINDER_MS;
  } catch {
    return false;
  }
};

const writeTutorialSeen = (): void => {
  try {
    globalThis.localStorage?.setItem(TUTORIAL_STORAGE_KEY, String(Date.now()));
  } catch {
    // Storage may be blocked in some iframe contexts.
  }
};
