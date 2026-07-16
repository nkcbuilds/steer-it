import Phaser, { GameObjects, Scene } from 'phaser';
import {
  clearEditorDraft,
  getEditorDraft,
  setEditorDraft,
} from '../editor/editorDraft';
import {
  addPointBetween,
  adjustPointWidth,
  cloneShaftMap,
  createEditableDraft,
  deletePoint,
  isEndpointIndex,
  movePoint,
  setPointWidth,
  validateDraft,
} from '../editor/mapEditorModel';
import { TunnelBuilder } from '../gameplay/TunnelBuilder';
import { preloadGameAssets } from '../gameplay/rocketTextures';
import { preloadUiAssets } from '../gameplay/uiAssets';
import { HANDCRAFTED_TUNNEL_MAP } from '../../shared/handcraftedMap';
import type { MapValidationResult, ShaftMap } from '../../shared/domain';
import type { MapEditorSceneData, TunnelRunSceneData } from './sceneData';

export type { MapEditorSceneData } from './sceneData';

export type EditorTool = 'select' | 'add' | 'delete' | 'width' | 'pan';

type EditorButton = {
  container: GameObjects.Container;
  label: GameObjects.Text;
  bg: GameObjects.Graphics;
  width: number;
  height: number;
  id: string;
};

type WidthHandleSide = 'left' | 'right';

const NODE_HIT_RADIUS = 36;
const MID_HIT_RADIUS = 28;
const WIDTH_HANDLE_HIT = 28;
const WIDTH_STEP = 10;
const MIN_ZOOM = 0.35;
const MAX_ZOOM = 2.4;
const FONT =
  'ui-monospace, SFMono-Regular, Menlo, Consolas, "Courier New", monospace';
const HINT_KEY = 'steer-it-map-editor-hint-v1';

/**
 * Practical map editor: explicit tool modes, zoom/pan, undo, width handles,
 * and a clear first-use hint. Keeps the shared draft model and test-flight path.
 */
export class MapEditor extends Scene {
  private map: ShaftMap = createEditableDraft(HANDCRAFTED_TUNNEL_MAP);
  private selectedIndex = 0;
  private validation: MapValidationResult = validateDraft(this.map);
  private tool: EditorTool = 'select';

  private tunnelGfx: GameObjects.Graphics | undefined;
  private overlayGfx: GameObjects.Graphics | undefined;
  private uiCamera: Phaser.Cameras.Scene2D.Camera | undefined;
  private uiNodes: GameObjects.GameObject[] = [];

  private headerBg: GameObjects.Graphics | undefined;
  private footerBg: GameObjects.Graphics | undefined;
  private titleText: GameObjects.Text | undefined;
  private toolHintText: GameObjects.Text | undefined;
  private statusText: GameObjects.Text | undefined;
  private selectionText: GameObjects.Text | undefined;
  private canvasHintText: GameObjects.Text | undefined;

  private toolButtons: EditorButton[] = [];
  private actionButtons: EditorButton[] = [];
  private footerButtons: EditorButton[] = [];

  private firstUseRoot: GameObjects.Container | undefined;
  private firstUseBg: GameObjects.Graphics | undefined;
  private firstUseText: GameObjects.Text | undefined;
  private firstUseClose: GameObjects.Container | undefined;

  private dragIndex: number | undefined;
  private widthDrag: WidthHandleSide | undefined;
  private panning = false;
  private drawingPath = false;
  private panLastX = 0;
  private panLastY = 0;
  private dirtyPreview = true;

  private undoStack: ShaftMap[] = [];
  private readonly maxUndo = 40;

  private headerH = 96;
  private footerH = 72;
  private contentWidth = 390;
  private viewW = 390;
  private viewH = 844;

  private pinchStartDist = 0;
  private pinchStartZoom = 1;
  private pinching = false;

  constructor() {
    super('MapEditor');
  }

  preload(): void {
    preloadGameAssets(this);
    preloadUiAssets(this);
  }

  init(data: MapEditorSceneData): void {
    const fromDraft = getEditorDraft();
    const base = data.baseMap ?? fromDraft ?? HANDCRAFTED_TUNNEL_MAP;
    this.map = createEditableDraft(base);
    if (fromDraft && !data.baseMap) {
      this.map = cloneShaftMap(fromDraft);
    }
    this.selectedIndex = 0;
    this.validation = validateDraft(this.map);
    this.dragIndex = undefined;
    this.widthDrag = undefined;
    this.panning = false;
    this.drawingPath = false;
    this.dirtyPreview = true;
    this.undoStack = [];
    this.tool = 'select';
    this.pinching = false;
  }

  create(): void {
    this.cameras.main.setBackgroundColor(0x071018);
    this.uiCamera = this.cameras.add(0, 0, this.scale.width, this.scale.height);
    this.uiCamera.setScroll(0, 0);
    this.uiCamera.setZoom(1);
    this.uiNodes = [];

    this.tunnelGfx = this.add.graphics().setDepth(1);
    this.overlayGfx = this.add.graphics().setDepth(20);

    this.headerBg = this.trackUi(this.add.graphics().setScrollFactor(0).setDepth(200));
    this.footerBg = this.trackUi(this.add.graphics().setScrollFactor(0).setDepth(200));

    this.titleText = this.trackUi(
      this.add
        .text(12, 14, 'MAP EDITOR', {
          color: '#e8f4ff',
          fontFamily: FONT,
          fontSize: '14px',
          fontStyle: 'bold',
        })
        .setScrollFactor(0)
        .setDepth(201)
    );

    this.toolHintText = this.trackUi(
      this.add
        .text(12, 34, '', {
          color: '#9fb3c8',
          fontFamily: FONT,
          fontSize: '11px',
        })
        .setScrollFactor(0)
        .setDepth(201)
    );

    this.statusText = this.trackUi(
      this.add
        .text(8, 0, '', {
          color: '#b8f0ff',
          fontFamily: FONT,
          fontSize: '11px',
          lineSpacing: 2,
          backgroundColor: '#00000099',
          padding: { x: 6, y: 4 },
          wordWrap: { width: 300 },
        })
        .setScrollFactor(0)
        .setDepth(210)
    );

    this.selectionText = this.trackUi(
      this.add
        .text(8, 0, '', {
          color: '#e8f4ff',
          fontFamily: FONT,
          fontSize: '11px',
          backgroundColor: '#00000099',
          padding: { x: 6, y: 4 },
        })
        .setScrollFactor(0)
        .setDepth(210)
    );

    this.canvasHintText = this.trackUi(
      this.add
        .text(0, 0, '', {
          color: '#c5d4e8',
          fontFamily: FONT,
          fontSize: '12px',
          align: 'center',
          backgroundColor: '#0a0f18cc',
          padding: { x: 10, y: 6 },
        })
        .setOrigin(0.5, 0)
        .setScrollFactor(0)
        .setDepth(205)
    );

    this.toolButtons = [
      this.makeButton('select', 'SELECT', () => this.setTool('select'), 72),
      this.makeButton('add', 'DRAW', () => this.setTool('add'), 62),
      this.makeButton('delete', 'DELETE', () => this.setTool('delete'), 70),
      this.makeButton('width', 'WIDTH', () => this.setTool('width'), 64),
      this.makeButton('pan', 'PAN', () => this.setTool('pan'), 52),
    ];

    this.actionButtons = [
      this.makeButton('zoomOut', '−', () => this.nudgeZoom(1 / 1.15), 40),
      this.makeButton('zoomIn', '+', () => this.nudgeZoom(1.15), 40),
      this.makeButton('fit', 'FIT', () => this.fitCameraToMap(), 52),
      this.makeButton('undo', 'UNDO', () => this.undo(), 58),
      this.makeButton('back', 'BACK', () => this.exitToGame(), 58),
    ];

    this.footerButtons = [
      this.makeButton('wMinus', 'W −', () => this.changeWidth(-WIDTH_STEP), 60),
      this.makeButton('wPlus', 'W +', () => this.changeWidth(WIDTH_STEP), 60),
      this.makeButton('reset', 'RESET', () => this.resetDraft(), 68),
      this.makeButton('test', 'TEST FLIGHT', () => this.launchTestFlight(), 112),
    ];

    this.buildFirstUseHint();
    this.wireCameras();

    this.layoutUi();
    this.refreshValidation();
    this.redrawAll();
    this.fitCameraToMap();
    this.updateToolChrome();

    if (!readHintSeen()) {
      this.showFirstUseHint();
    }

    this.input.addPointer(2);
    this.input.on('pointerdown', this.onPointerDown, this);
    this.input.on('pointermove', this.onPointerMove, this);
    this.input.on('pointerup', this.onPointerUp, this);
    this.input.on('pointerupoutside', this.onPointerUp, this);
    this.input.on('wheel', this.onWheel, this);
    this.scale.on('resize', this.layoutUi, this);

    this.events.once('shutdown', () => {
      this.input.off('pointerdown', this.onPointerDown, this);
      this.input.off('pointermove', this.onPointerMove, this);
      this.input.off('pointerup', this.onPointerUp, this);
      this.input.off('pointerupoutside', this.onPointerUp, this);
      this.input.off('wheel', this.onWheel, this);
      this.scale.off('resize', this.layoutUi, this);
    });
  }

  override update(): void {
    this.updatePinchZoom();
    if (this.dirtyPreview) {
      this.redrawAll();
      this.dirtyPreview = false;
    }
  }

  private makeButton(
    id: string,
    label: string,
    onClick: () => void,
    width = 72,
    height = 34
  ): EditorButton {
    const bg = this.add.graphics();
    const text = this.add
      .text(0, 0, label, {
        color: '#e0fbfc',
        fontFamily: FONT,
        fontSize: width < 48 ? '16px' : '11px',
        fontStyle: 'bold',
      })
      .setOrigin(0.5);

    const container = this.trackUi(this.add.container(0, 0, [bg, text]));
    container.setSize(width, height);
    container.setScrollFactor(0);
    container.setDepth(202);
    container.setInteractive(
      new Phaser.Geom.Rectangle(-width / 2, -height / 2, width, height),
      Phaser.Geom.Rectangle.Contains
    );
    container.on('pointerup', () => {
      onClick();
    });

    const button: EditorButton = {
      container,
      label: text,
      bg,
      width,
      height,
      id,
    };
    this.paintButton(button, false);
    return button;
  }

  private trackUi<T extends GameObjects.GameObject>(node: T): T {
    this.uiNodes.push(node);
    return node;
  }

  private wireCameras(): void {
    if (!this.uiCamera || !this.tunnelGfx || !this.overlayGfx) return;
    // World camera ignores chrome; UI camera ignores map geometry.
    this.cameras.main.ignore(this.uiNodes);
    this.uiCamera.ignore([this.tunnelGfx, this.overlayGfx]);
  }

  private paintButton(button: EditorButton, active: boolean): void {
    const { bg, width, height } = button;
    const fill = active ? 0xff9f1c : 0x1b2838;
    const stroke = active ? 0xffe66d : 0x5ec8e8;
    const textColor = active ? '#1a1208' : '#e0fbfc';
    bg.clear();
    bg.fillStyle(fill, 0.96);
    bg.fillRect(-width / 2, -height / 2, width, height);
    bg.lineStyle(2, stroke, 1);
    bg.strokeRect(-width / 2, -height / 2, width, height);
    if (!active) {
      bg.fillStyle(0xffffff, 0.08);
      bg.fillRect(-width / 2 + 3, -height / 2 + 2, width - 6, 3);
    }
    button.label.setColor(textColor);
  }

  private setTool(tool: EditorTool): void {
    this.tool = tool;
    this.dragIndex = undefined;
    this.widthDrag = undefined;
    this.panning = false;
    this.updateToolChrome();
  }

  private updateToolChrome(): void {
    for (const btn of this.toolButtons) {
      const active =
        (btn.id === 'select' && this.tool === 'select') ||
        (btn.id === 'add' && this.tool === 'add') ||
        (btn.id === 'delete' && this.tool === 'delete') ||
        (btn.id === 'width' && this.tool === 'width') ||
        (btn.id === 'pan' && this.tool === 'pan');
      this.paintButton(btn, active);
    }

    const hints: Record<EditorTool, string> = {
      select: 'SELECT/MOVE — tap node, drag to move · empty drag pans',
      add: 'DRAW — drag from the yellow exit node to sketch the next shaft',
      delete: 'DELETE — tap an interior node to remove it',
      width: 'WIDTH — drag side handles or use W − / W +',
      pan: 'PAN — drag anywhere on the map to pan the view',
    };
    this.toolHintText?.setText(hints[this.tool]);
    this.canvasHintText?.setText(this.canvasInstruction());
  }

  private canvasInstruction(): string {
    switch (this.tool) {
      case 'select':
        return 'Drag centreline nodes · endpoints lock vertical';
      case 'add':
        return 'Drag to connect nodes · release anywhere to place the opening';
      case 'delete':
        return 'Tap interior nodes (cyan) to delete';
      case 'width':
        return 'Drag orange handles · or W − / W + below';
      case 'pan':
        return 'Drag to pan · pinch or wheel to zoom';
      default:
        return '';
    }
  }

  private layoutUi = (): void => {
    this.viewW = Math.max(1, this.scale.width);
    this.viewH = Math.max(1, this.scale.height);
    this.cameras.main.setSize(this.viewW, this.viewH);
    this.uiCamera?.setSize(this.viewW, this.viewH);
    this.uiCamera?.setViewport(0, 0, this.viewW, this.viewH);
    this.uiCamera?.setZoom(1);
    this.uiCamera?.setScroll(0, 0);

    const narrow = this.viewW < 480;
    const short = this.viewH < 700;
    this.headerH = narrow ? 118 : short ? 100 : 96;
    this.footerH = short ? 64 : 72;

    // World camera: centered content viewport + independent zoom.
    this.contentWidth = this.viewW;
    this.cameras.main.setViewport(0, 0, this.viewW, this.viewH);
    this.cameras.main.setBounds(
      0,
      0,
      this.map.worldWidth,
      this.map.worldHeight
    );

    const uiW = this.viewW;

    if (this.headerBg) {
      this.headerBg.clear();
      this.headerBg.fillStyle(0x0a121c, 0.96);
      this.headerBg.fillRect(0, 0, uiW, this.headerH);
      this.headerBg.lineStyle(1, 0x415a77, 1);
      this.headerBg.lineBetween(0, this.headerH, uiW, this.headerH);
      this.headerBg.lineStyle(2, 0xff9f1c, 0.75);
      this.headerBg.lineBetween(10, 2, 42, 2);
      this.headerBg.lineStyle(1, 0x5ec8e8, 0.55);
      this.headerBg.lineBetween(uiW - 42, this.headerH - 2, uiW - 10, this.headerH - 2);
    }

    if (this.footerBg) {
      this.footerBg.clear();
      this.footerBg.fillStyle(0x0a121c, 0.96);
      this.footerBg.fillRect(0, this.viewH - this.footerH, uiW, this.footerH);
      this.footerBg.lineStyle(1, 0x415a77, 1);
      this.footerBg.lineBetween(
        0,
        this.viewH - this.footerH,
        uiW,
        this.viewH - this.footerH
      );
    }

    this.titleText?.setPosition(12, 10);
    this.toolHintText?.setPosition(12, 30);
    this.toolHintText?.setWordWrapWidth(uiW - 24);

    // Tool row
    const toolY = narrow ? 78 : 66;
    this.layoutButtonRow(this.toolButtons, 8, toolY, uiW - 16, 6);

    // Action row top-right on wide; share the tool row on narrow.
    const actionY = 18;
    if (!narrow) {
      this.layoutButtonRowRight(this.actionButtons, uiW - 8, actionY, 6);
    } else {
      this.layoutButtonRowRight(this.actionButtons, uiW - 6, toolY, 4);
      this.layoutButtonRow(
        this.toolButtons,
        6,
        toolY,
        Math.max(160, uiW * 0.52),
        4
      );
    }

    // Footer actions
    this.layoutButtonRow(
      this.footerButtons,
      8,
      this.viewH - this.footerH / 2,
      uiW - 16,
      8
    );

    this.statusText?.setPosition(8, this.headerH + 6);
    this.statusText?.setWordWrapWidth(Math.max(160, uiW - 16));
    this.selectionText?.setPosition(8, this.viewH - this.footerH - 28);
    this.canvasHintText?.setPosition(uiW / 2, this.headerH + 28);
    this.canvasHintText?.setWordWrapWidth(uiW - 24);

    this.layoutFirstUseHint();
    this.updateToolChrome();
  };

  private layoutButtonRow(
    buttons: EditorButton[],
    left: number,
    centerY: number,
    maxWidth: number,
    gap: number
  ): void {
    const total =
      buttons.reduce((sum, b) => sum + b.width, 0) + gap * (buttons.length - 1);
    let scale = 1;
    if (total > maxWidth && total > 0) {
      scale = maxWidth / total;
    }
    let x = left;
    for (const btn of buttons) {
      const w = btn.width * scale;
      btn.container.setScale(scale);
      btn.container.setPosition(x + w / 2, centerY);
      x += w + gap * scale;
    }
  }

  private layoutButtonRowRight(
    buttons: EditorButton[],
    right: number,
    centerY: number,
    gap: number
  ): void {
    let x = right;
    for (let i = buttons.length - 1; i >= 0; i -= 1) {
      const btn = buttons[i];
      if (!btn) continue;
      btn.container.setScale(1);
      x -= btn.width / 2;
      btn.container.setPosition(x, centerY);
      x -= btn.width / 2 + gap;
    }
  }

  private buildFirstUseHint(): void {
    this.firstUseBg = this.add.graphics();
    this.firstUseText = this.add
      .text(0, 0, '', {
        color: '#e8f4ff',
        fontFamily: FONT,
        fontSize: '12px',
        align: 'left',
        lineSpacing: 4,
        wordWrap: { width: 280 },
      })
      .setOrigin(0, 0);

    const closeBg = this.add.graphics();
    const closeLabel = this.add
      .text(0, 0, 'GOT IT', {
        color: '#1a1208',
        fontFamily: FONT,
        fontSize: '12px',
        fontStyle: 'bold',
      })
      .setOrigin(0.5);
    closeBg.fillStyle(0xff9f1c, 0.95);
    closeBg.fillRect(-40, -16, 80, 32);
    closeBg.lineStyle(2, 0xffe66d, 1);
    closeBg.strokeRect(-40, -16, 80, 32);
    this.firstUseClose = this.add.container(0, 0, [closeBg, closeLabel]);
    this.firstUseClose.setSize(80, 32);
    this.firstUseClose.setInteractive(
      new Phaser.Geom.Rectangle(-40, -16, 80, 32),
      Phaser.Geom.Rectangle.Contains
    );
    this.firstUseClose.on('pointerup', () => this.hideFirstUseHint());

    this.firstUseRoot = this.trackUi(
      this.add
        .container(0, 0, [
          this.firstUseBg,
          this.firstUseText,
          this.firstUseClose,
        ])
        .setScrollFactor(0)
        .setDepth(240)
        .setVisible(false)
    );
  }

  private showFirstUseHint(): void {
    this.firstUseRoot?.setVisible(true);
    this.layoutFirstUseHint();
  }

  private hideFirstUseHint(): void {
    this.firstUseRoot?.setVisible(false);
    writeHintSeen();
  }

  private layoutFirstUseHint(): void {
    if (!this.firstUseRoot || !this.firstUseBg || !this.firstUseText) return;
    if (!this.firstUseRoot.visible) return;

    const w = Math.min(320, this.viewW - 20);
    const h = 168;
    const x = (this.viewW - w) / 2;
    const y = this.headerH + 48;

    this.firstUseBg.clear();
    this.firstUseBg.fillStyle(0x04060c, 0.55);
    this.firstUseBg.fillRect(0, 0, this.viewW, this.viewH);
    this.firstUseBg.fillStyle(0x0d1b2a, 0.97);
    this.firstUseBg.fillRect(x, y, w, h);
    this.firstUseBg.lineStyle(2, 0x5ec8e8, 0.9);
    this.firstUseBg.strokeRect(x, y, w, h);
    this.firstUseBg.lineStyle(2, 0xff9f1c, 0.8);
    this.firstUseBg.lineBetween(x + 14, y + 2, x + 52, y + 2);

    this.firstUseText.setWordWrapWidth(w - 28);
    this.firstUseText.setPosition(x + 14, y + 14);
    this.firstUseText.setText(
      [
        'EDIT THE SHAFT',
        '1. SELECT — move nodes',
        '2. ADD / DELETE — shape path',
        '3. WIDTH — pull side handles',
        '4. TEST FLIGHT when VALID',
      ].join('\n')
    );
    this.firstUseClose?.setPosition(x + w / 2, y + h - 28);
  }

  private redrawAll(): void {
    if (!this.tunnelGfx || !this.overlayGfx) return;

    try {
      const geometry = TunnelBuilder.buildGeometry(this.map);
      TunnelBuilder.drawPreview(this.tunnelGfx, geometry, {
        editorPreview: true,
      });
    } catch {
      this.tunnelGfx.clear();
      this.tunnelGfx.fillStyle(0x121a24, 1);
      this.tunnelGfx.fillRect(0, 0, this.map.worldWidth, this.map.worldHeight);
    }

    this.overlayGfx.clear();
    const points = this.map.points;
    const zoom = this.cameras.main.zoom || 1;
    const nodeR = 14 / Math.sqrt(zoom);
    const midR = 10 / Math.sqrt(zoom);

    if (points.length >= 2) {
      this.overlayGfx.lineStyle(2.5, 0x80ed99, 0.9);
      const first = points[0];
      if (first) {
        this.overlayGfx.beginPath();
        this.overlayGfx.moveTo(first.x, first.y);
        for (let i = 1; i < points.length; i += 1) {
          const p = points[i];
          if (p) this.overlayGfx.lineTo(p.x, p.y);
        }
        this.overlayGfx.strokePath();
      }
    }

    // Midpoint add markers
    for (let i = 0; i < points.length - 1; i += 1) {
      const a = points[i];
      const b = points[i + 1];
      if (!a || !b) continue;
      const mx = (a.x + b.x) * 0.5;
      const my = (a.y + b.y) * 0.5;
      const emphasize = this.tool === 'add';
      this.overlayGfx.fillStyle(emphasize ? 0xffe66d : 0xc9b458, emphasize ? 1 : 0.75);
      this.overlayGfx.fillCircle(mx, my, midR);
      this.overlayGfx.lineStyle(2, 0x0a121c, 0.9);
      this.overlayGfx.lineBetween(mx - midR * 0.55, my, mx + midR * 0.55, my);
      this.overlayGfx.lineBetween(mx, my - midR * 0.55, mx, my + midR * 0.55);
    }

    for (let i = 0; i < points.length; i += 1) {
      const p = points[i];
      if (!p) continue;
      const endpoint = isEndpointIndex(this.map, i);
      const selected = i === this.selectedIndex;
      const fill = selected
        ? 0xee6c4d
        : endpoint
          ? 0x98c1d9
          : this.tool === 'delete'
            ? 0x4cc9f0
            : 0x4cc9f0;
      const r = selected ? nodeR * 1.2 : nodeR;
      this.overlayGfx.fillStyle(fill, 1);
      this.overlayGfx.fillCircle(p.x, p.y, r);
      this.overlayGfx.lineStyle(selected ? 3 : 2, 0xffffff, selected ? 1 : 0.55);
      this.overlayGfx.strokeCircle(p.x, p.y, r);

      // Width guide line
      this.overlayGfx.lineStyle(1, fill, 0.55);
      this.overlayGfx.lineBetween(
        p.x - p.width * 0.5,
        p.y,
        p.x + p.width * 0.5,
        p.y
      );

      // Selected width handles (obvious grip circles)
      if (selected) {
        const hx = p.width * 0.5;
        const hr = Math.max(9, 12 / Math.sqrt(zoom));
        const handleSides = [-1, 1];
        for (const side of handleSides) {
          const hxPos = p.x + side * hx;
          this.overlayGfx.fillStyle(0xff9f1c, 0.95);
          this.overlayGfx.fillCircle(hxPos, p.y, hr);
          this.overlayGfx.lineStyle(2, 0xffe66d, 1);
          this.overlayGfx.strokeCircle(hxPos, p.y, hr);
          this.overlayGfx.fillStyle(0x0a121c, 0.85);
          this.overlayGfx.fillRect(hxPos - 4, p.y - 1.5, 8, 3);
        }
      }
    }

    this.updateSelectionLabel();
  }

  private updateSelectionLabel(): void {
    const p = this.map.points[this.selectedIndex];
    if (!p || !this.selectionText) return;
    const kind = isEndpointIndex(this.map, this.selectedIndex)
      ? 'ENDPOINT'
      : 'NODE';
    this.selectionText.setText(
      `${kind} ${this.selectedIndex + 1}/${this.map.points.length}  x=${p.x} y=${p.y}  w=${p.width}`
    );
  }

  private refreshValidation(): void {
    this.validation = validateDraft(this.map);
    if (!this.statusText) return;
    if (this.validation.valid) {
      const warn =
        this.validation.warnings.length > 0
          ? `  ·  ${this.validation.warnings[0]}`
          : '';
      this.statusText.setColor('#80ed99');
      this.statusText.setText(`VALID${warn}`);
    } else {
      this.statusText.setColor('#ff4d6d');
      this.statusText.setText(
        `INVALID: ${this.validation.errors[0] ?? 'geometry error'}`
      );
    }
  }

  private pushUndo(): void {
    this.undoStack.push(cloneShaftMap(this.map));
    if (this.undoStack.length > this.maxUndo) {
      this.undoStack.shift();
    }
  }

  private undo(): void {
    const prev = this.undoStack.pop();
    if (!prev) return;
    this.map = prev;
    this.selectedIndex = clamp(
      this.selectedIndex,
      0,
      this.map.points.length - 1
    );
    this.dirtyPreview = true;
    this.refreshValidation();
    setEditorDraft(this.map);
  }

  private markDirty(): void {
    this.dirtyPreview = true;
    this.refreshValidation();
    setEditorDraft(this.map);
  }

  private centerCameraOnMap(): void {
    const mid = this.map.points[Math.floor(this.map.points.length / 2)];
    const focusY = mid?.y ?? this.map.worldHeight * 0.5;
    this.cameras.main.centerOn(this.map.worldWidth / 2, focusY);
  }

  private fitCameraToMap(): void {
    const cam = this.cameras.main;
    const usableH = Math.max(
      120,
      this.viewH - this.headerH - this.footerH - 24
    );
    const usableW = Math.max(120, this.contentWidth - 16);
    const zoomX = usableW / this.map.worldWidth;
    const zoomY = usableH / this.map.worldHeight;
    const zoom = clamp(Math.min(zoomX, zoomY) * 0.92, MIN_ZOOM, MAX_ZOOM);
    cam.setZoom(zoom);
    this.updateWorldCameraBounds();
    this.centerCameraOnMap();
  }

  /** Keep a fully zoomed-out shaft centered instead of pinned to the left. */
  private updateWorldCameraBounds(): void {
    const cam = this.cameras.main;
    const zoom = cam.zoom || 1;
    const visibleWorldWidth = cam.width / zoom;
    const padX = Math.max(2400, (visibleWorldWidth - this.map.worldWidth) / 2);
    cam.setBounds(
      -padX,
      -2400,
      this.map.worldWidth + padX * 2,
      this.map.worldHeight + 4800
    );
  }

  private nudgeZoom(factor: number): void {
    const cam = this.cameras.main;
    const next = clamp(cam.zoom * factor, MIN_ZOOM, MAX_ZOOM);
    cam.setZoom(next);
    this.updateWorldCameraBounds();
  }

  private hitNode(worldX: number, worldY: number): number | undefined {
    const zoom = this.cameras.main.zoom || 1;
    const radius = NODE_HIT_RADIUS / zoom;
    let best: number | undefined;
    let bestDist = radius;
    for (let i = 0; i < this.map.points.length; i += 1) {
      const p = this.map.points[i];
      if (!p) continue;
      const d = Math.hypot(p.x - worldX, p.y - worldY);
      if (d <= bestDist) {
        bestDist = d;
        best = i;
      }
    }
    return best;
  }

  private hitMidpoint(worldX: number, worldY: number): number | undefined {
    const zoom = this.cameras.main.zoom || 1;
    const radius = MID_HIT_RADIUS / zoom;
    for (let i = 0; i < this.map.points.length - 1; i += 1) {
      const a = this.map.points[i];
      const b = this.map.points[i + 1];
      if (!a || !b) continue;
      const mx = (a.x + b.x) * 0.5;
      const my = (a.y + b.y) * 0.5;
      if (Math.hypot(mx - worldX, my - worldY) <= radius) return i;
    }
    return undefined;
  }

  private hitWidthHandle(
    worldX: number,
    worldY: number
  ): WidthHandleSide | undefined {
    const p = this.map.points[this.selectedIndex];
    if (!p) return undefined;
    const zoom = this.cameras.main.zoom || 1;
    const radius = WIDTH_HANDLE_HIT / zoom;
    const left = { x: p.x - p.width * 0.5, y: p.y };
    const right = { x: p.x + p.width * 0.5, y: p.y };
    if (Math.hypot(left.x - worldX, left.y - worldY) <= radius) return 'left';
    if (Math.hypot(right.x - worldX, right.y - worldY) <= radius) return 'right';
    return undefined;
  }

  private isPointerOverUi(pointer: Phaser.Input.Pointer): boolean {
    const y = pointer.y;
    return y <= this.headerH || y >= this.viewH - this.footerH;
  }

  private onPointerDown = (pointer: Phaser.Input.Pointer): void => {
    if (this.firstUseRoot?.visible) return;
    if (this.isPointerOverUi(pointer)) return;

    // Pinch start is handled in updatePinchZoom via active pointer count.
    if (this.input.pointer1.isDown && this.input.pointer2.isDown) {
      this.beginPinch();
      return;
    }

    const worldX = pointer.worldX;
    const worldY = pointer.worldY;

    if (this.tool === 'pan') {
      this.panning = true;
      this.panLastX = pointer.x;
      this.panLastY = pointer.y;
      return;
    }

    if (this.tool === 'width' || this.tool === 'select') {
      const handle = this.hitWidthHandle(worldX, worldY);
      if (handle !== undefined) {
        this.pushUndo();
        this.widthDrag = handle;
        return;
      }
    }

    const node = this.hitNode(worldX, worldY);
    if (node !== undefined) {
      if (this.tool === 'delete') {
        this.selectedIndex = node;
        this.deleteSelected();
        return;
      }
      this.selectedIndex = node;
      this.dirtyPreview = true;
      if (this.tool === 'add' && node === this.map.points.length - 1) {
        this.pushUndo();
        this.drawingPath = true;
      }
      if (this.tool === 'select') {
        this.pushUndo();
        this.dragIndex = node;
      }
      return;
    }

    const mid = this.hitMidpoint(worldX, worldY);
    if (mid !== undefined && (this.tool === 'add' || this.tool === 'select')) {
      this.pushUndo();
      const working = cloneShaftMap(this.map);
      const result = addPointBetween(working, mid);
      if (result) {
        this.map = result.map;
        this.selectedIndex = result.newIndex;
        this.markDirty();
      }
      return;
    }

    if (this.tool === 'add') {
      this.pushUndo();
      this.drawingPath = true;
      this.appendDrawPoint(worldX, worldY);
      return;
    }

    // Empty space: pan except delete taps.
    if (this.tool !== 'delete') {
      this.panning = true;
      this.panLastX = pointer.x;
      this.panLastY = pointer.y;
    }
  };

  private onPointerMove = (pointer: Phaser.Input.Pointer): void => {
    if (!pointer.isDown) return;
    if (this.pinching) return;

    if (this.drawingPath) {
      this.appendDrawPoint(pointer.worldX, pointer.worldY);
      return;
    }

    if (this.widthDrag !== undefined) {
      const p = this.map.points[this.selectedIndex];
      if (!p) return;
      const half = Math.abs(pointer.worldX - p.x) * 2;
      this.map = setPointWidth(this.map, this.selectedIndex, half);
      this.markDirty();
      return;
    }

    if (this.dragIndex !== undefined) {
      this.map = movePoint(
        this.map,
        this.dragIndex,
        pointer.worldX,
        pointer.worldY
      );
      this.markDirty();
      return;
    }

    if (this.panning) {
      const cam = this.cameras.main;
      const zoom = cam.zoom || 1;
      cam.scrollX += (this.panLastX - pointer.x) / zoom;
      cam.scrollY += (this.panLastY - pointer.y) / zoom;
      this.panLastX = pointer.x;
      this.panLastY = pointer.y;
    }
  };

  private onPointerUp = (): void => {
    this.dragIndex = undefined;
    this.widthDrag = undefined;
    this.panning = false;
    this.drawingPath = false;
    if (!this.input.pointer1.isDown || !this.input.pointer2.isDown) {
      this.pinching = false;
    }
  };

  private appendDrawPoint(worldX: number, worldY: number): void {
    const last = this.map.points[this.map.points.length - 1];
    const launch = this.map.points[0];
    if (!last || !launch) return;
    const spacing = 62 / (this.cameras.main.zoom || 1);
    if (Math.hypot(worldX - last.x, worldY - last.y) < spacing) return;

    const width = last.width;
    const margin = width * 0.5 + 80;
    let x = worldX;
    let y = Math.min(worldY, launch.y - 24);

    // Grow the authored world as the player draws. When the stroke reaches the
    // top/left edge, shift the whole graph without changing its shape.
    if (x < margin) {
      const shift = margin - x;
      for (const point of this.map.points) point.x += shift;
      this.map.worldWidth += shift;
      x += shift;
    } else if (x > this.map.worldWidth - margin) {
      this.map.worldWidth = x + margin;
    }
    if (y < 80) {
      const shift = 80 - y;
      for (const point of this.map.points) point.y += shift;
      this.map.worldHeight += shift;
      y += shift;
    }

    this.map.points.push({
      id: `draw-${Date.now()}-${this.map.points.length}`,
      x: Math.round(x),
      y: Math.round(y),
      width,
    });
    this.selectedIndex = this.map.points.length - 1;
    this.updateWorldCameraBounds();
    this.markDirty();
  }

  private beginPinch(): void {
    const p1 = this.input.pointer1;
    const p2 = this.input.pointer2;
    this.pinchStartDist = Math.hypot(p1.x - p2.x, p1.y - p2.y);
    this.pinchStartZoom = this.cameras.main.zoom;
    this.pinching = this.pinchStartDist > 8;
    this.dragIndex = undefined;
    this.widthDrag = undefined;
    this.panning = false;
  }

  private updatePinchZoom(): void {
    const p1 = this.input.pointer1;
    const p2 = this.input.pointer2;
    if (!p1.isDown || !p2.isDown) {
      this.pinching = false;
      return;
    }
    if (!this.pinching) {
      this.beginPinch();
      return;
    }
    const dist = Math.hypot(p1.x - p2.x, p1.y - p2.y);
    if (this.pinchStartDist < 8) return;
    const factor = dist / this.pinchStartDist;
    const next = clamp(this.pinchStartZoom * factor, MIN_ZOOM, MAX_ZOOM);
    this.cameras.main.setZoom(next);
    this.updateWorldCameraBounds();
  }

  private onWheel = (
    pointer: Phaser.Input.Pointer,
    _g: unknown,
    _dx: number,
    dy: number,
    _dz: number
  ): void => {
    if (this.isPointerOverUi(pointer)) {
      // Still allow scroll-pan when over map edges? Keep simple: zoom only on map.
      return;
    }
    const cam = this.cameras.main;
    const factor = dy > 0 ? 1 / 1.08 : 1.08;
    cam.setZoom(clamp(cam.zoom * factor, MIN_ZOOM, MAX_ZOOM));
    this.updateWorldCameraBounds();
  };

  private changeWidth(delta: number): void {
    this.pushUndo();
    this.map = adjustPointWidth(this.map, this.selectedIndex, delta);
    this.markDirty();
  }

  private deleteSelected(): void {
    if (isEndpointIndex(this.map, this.selectedIndex)) {
      if (this.statusText) {
        this.statusText.setColor('#ffb347');
        this.statusText.setText('Endpoints cannot be deleted');
      }
      return;
    }
    this.pushUndo();
    const next = deletePoint(cloneShaftMap(this.map), this.selectedIndex);
    if (!next) return;
    this.map = next;
    this.selectedIndex = clamp(
      this.selectedIndex,
      0,
      this.map.points.length - 1
    );
    this.markDirty();
  }

  private resetDraft(): void {
    this.pushUndo();
    this.map = createEditableDraft(HANDCRAFTED_TUNNEL_MAP);
    this.selectedIndex = 0;
    this.markDirty();
    this.fitCameraToMap();
  }

  private launchTestFlight(): void {
    this.refreshValidation();
    if (!this.validation.valid) {
      if (this.statusText) {
        this.statusText.setColor('#ff4d6d');
        this.statusText.setText(
          `FIX ERRORS BEFORE TEST: ${this.validation.errors[0] ?? ''}`
        );
      }
      return;
    }

    setEditorDraft(this.map);
    const data: TunnelRunSceneData = {
      mode: 'editor-test',
      map: cloneShaftMap(this.map),
    };
    this.scene.start('TunnelRun', data);
  }

  private exitToGame(): void {
    clearEditorDraft();
    const data: TunnelRunSceneData = { mode: 'play' };
    this.scene.start('TunnelRun', data);
  }
}

const clamp = (value: number, minimum: number, maximum: number): number =>
  Math.min(Math.max(value, minimum), maximum);

const readHintSeen = (): boolean => {
  try {
    return globalThis.localStorage?.getItem(HINT_KEY) === '1';
  } catch {
    return false;
  }
};

const writeHintSeen = (): void => {
  try {
    globalThis.localStorage?.setItem(HINT_KEY, '1');
  } catch {
    // ignore
  }
};
