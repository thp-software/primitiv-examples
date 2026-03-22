/**
 * Name: showcase-12-parallax-city
 * Category: showcase
 * Description: A moody rainy cityscape with multi-layer parallax scrolling, lightning
 *   storms, procedural buildings, animated cars, and atmospheric post-processing.
 *
 * Architecture:
 *   - Layer 0  (sky):               Static gradient from dark to lighter blue.
 *   - Layer 1  (moon):              Static moon with craters, follows camera.
 *   - Layer 2  (lightning):         Dynamic zigzag bolt rendered during storms.
 *   - Layer 3  (distant-mountains): Static silhouettes, very slow parallax (85%).
 *   - Layer 4  (mountains):         Static mountain sprites, medium parallax (50%).
 *   - Layer 5  (grass):             Static green band between mountains and city.
 *   - Layer 6  (buildings):         Static procedural skyline with lit windows.
 *   - Layer 7  (road):              Static road with dashed center line.
 *   - Layer 8  (streetlights):      Static lamp posts along the road.
 *   - Layer 9  (cars):              Dynamic cars driving left/right on the road.
 *   - Layer 10 (rain):              Dynamic rain particles via dotCloudMulti.
 *
 * Key Primitiv Concepts demonstrated:
 *   - Parallax scrolling via `layer.setOrigin()` with different speed factors.
 *   - Palette animation: normal palette (slot 0) + lightning flash palette (slot 1).
 *   - Static vs dynamic layer separation for bandwidth efficiency.
 *   - `spriteCloudVariedMulti` for rendering varied multicolor sprites (buildings,
 *     mountains, cars, streetlights).
 *   - `dotCloudMulti` for particle rain rendering.
 *   - Responsive display with `ScalingMode.Responsive`.
 *   - Post-processing: CRT scanlines + ambient glow.
 *   - Multipass rendering: background, buildings, foreground, overlay.
 *   - Input: arrow keys / mouse drag / touch drag for horizontal scrolling.
 */
import {
  Engine,
  User,
  Layer,
  Display,
  OrderBuilder,
  Vector2,
  ScalingMode,
  KeyboardInput,
  MouseInput,
  InputDeviceType,
  type IApplication,
  type IRuntime,
} from "@primitiv/engine";

// ─── Constants ───────────────────────────────────────────────────────────────
const WORLD_W = 256; // World width in cells
const ROAD_HEIGHT = 5; // Road thickness in cells
const GRASS_HEIGHT = 4; // Grass band thickness in cells
const LAYER_H = 256; // Oversized layer height for responsive
const DEFAULT_H = 45; // Default display height
const TICK_RATE = 30;

// ─── Adaptive cell sizing ────────────────────────────────────────────────────
const CELL_NORMAL = 16;
const CELL_SMALL = 8;
const CELL_TINY = 4;
const MIN_DISPLAY_W = 80; // Minimum columns before shrinking cells
const MIN_DISPLAY_H = 40; // Minimum rows before shrinking cells

// ─── Palette color IDs ──────────────────────────────────────────────────────
const C = {
  // Sky gradient (1–8)
  SKY_1: 1,
  SKY_2: 2,
  SKY_3: 3,
  SKY_4: 4,
  SKY_5: 5,
  SKY_6: 6,
  SKY_7: 7,
  SKY_8: 8,
  // Ground / grass gradient (11–18)
  GRASS_1: 11,
  GRASS_2: 12,
  GRASS_3: 13,
  GRASS_4: 14,
  GRASS_5: 15,
  GRASS_6: 16,
  GRASS_7: 17,
  GRASS_8: 18,
  // Rain
  RAIN: 20,
  // Buildings
  BLDG_1: 21,
  BLDG_2: 22,
  BLDG_3: 23,
  WIN_DIM: 24,
  WIN_LIT: 33,
  BLDG_SHADOW: 28,
  // Road
  ROAD: 25,
  SIDEWALK: 26,
  ROAD_LINE: 27,
  // Streetlights
  POLE: 30,
  LAMP: 31,
  // Cars
  CAR_RED: 32,
  CAR_HEADLIGHT: 34,
  CAR_TAILLIGHT: 38,
  // Mountains close
  MTN_1: 35,
  MTN_2: 36,
  MTN_3: 37,
  // Mountains distant
  MTN_D1: 47,
  MTN_D2: 48,
  MTN_D3: 49,
  // Moon
  MOON: 40,
  MOON_CRATER: 41,
  // Lightning
  BOLT_CORE: 45,
  BOLT_GLOW: 46,
} as const;

// ─── Per-user state ─────────────────────────────────────────────────────────
interface CityUserData {
  display: Display;
  layers: Map<string, Layer>;
  // Mouse drag
  mouseDragActive: boolean;
  mouseDragAnchorWorldX: number;
  mouseDragAnchorLocalX: number;
  // Touch drag
  touchDragActive: boolean;
  touchDragAnchorWorldX: number;
  touchDragAnchorLocalX: number;
  // Display metrics (responsive)
  displayW: number;
  displayH: number;
  cellSize: number;
  // Lightning
  lightningActive: boolean;
  lightningPhase: number;
  lightningTimer: number;
  lightningX: number;
  lastThunderTime: number;
  // Rain
  rainDrops: { x: number; y: number; speed: number }[];
  // Precomputed mountain placements
  mountainsData: MountainPlacement[];
  distantMountainsData: MountainPlacement[];
}

interface MountainPlacement {
  spriteIndex: number;
  posX: number;
  sizeY: number;
}

// ─── Shared state (all users) ───────────────────────────────────────────────
interface Car {
  x: number;
  lane: number; // 0 = top lane (←), 1 = bottom lane (→)
  speed: number;
  direction: number; // 1 = right, -1 = left
  spriteId: number;
}

// ─── Application ─────────────────────────────────────────────────────────────
export class ParallaxCity implements IApplication<Engine, User<CityUserData>> {
  private cars: Car[] = [];

  // ─────────────────────────────────────────────────────────────────────
  // INIT
  // ─────────────────────────────────────────────────────────────────────

  async init(runtime: IRuntime, engine: Engine): Promise<void> {
    // ── Palette slot 0: Normal ──
    const palette = [
      { colorId: 0, r: 0, g: 0, b: 0, a: 255 },
      // Sky gradient
      { colorId: 1, r: 8, g: 15, b: 50, a: 255 },
      { colorId: 2, r: 12, g: 25, b: 65, a: 255 },
      { colorId: 3, r: 18, g: 35, b: 80, a: 255 },
      { colorId: 4, r: 25, g: 45, b: 95, a: 255 },
      { colorId: 5, r: 28, g: 45, b: 80, a: 255 },
      { colorId: 6, r: 35, g: 55, b: 100, a: 255 },
      { colorId: 7, r: 40, g: 65, b: 120, a: 255 },
      { colorId: 8, r: 48, g: 80, b: 135, a: 255 },
      // Grass / ground gradient
      { colorId: 11, r: 10, g: 25, b: 10, a: 255 },
      { colorId: 12, r: 20, g: 55, b: 20, a: 255 },
      { colorId: 13, r: 25, g: 70, b: 25, a: 255 },
      { colorId: 14, r: 35, g: 85, b: 30, a: 255 },
      { colorId: 15, r: 45, g: 100, b: 35, a: 255 },
      { colorId: 16, r: 55, g: 115, b: 40, a: 255 },
      { colorId: 17, r: 65, g: 130, b: 45, a: 255 },
      { colorId: 18, r: 75, g: 140, b: 50, a: 255 },
      // Rain
      { colorId: 20, r: 50, g: 120, b: 160, a: 255 },
      // Buildings
      { colorId: 21, r: 25, g: 25, b: 30, a: 255 },
      { colorId: 22, r: 30, g: 30, b: 35, a: 255 },
      { colorId: 23, r: 35, g: 35, b: 40, a: 255 },
      { colorId: 24, r: 60, g: 40, b: 10, a: 255 },
      { colorId: 28, r: 15, g: 15, b: 20, a: 255 },
      { colorId: 33, r: 180, g: 150, b: 70, a: 255, e: 40 },
      // Road
      { colorId: 25, r: 20, g: 20, b: 25, a: 255 },
      { colorId: 26, r: 40, g: 40, b: 45, a: 255 },
      { colorId: 27, r: 100, g: 100, b: 100, a: 255 },
      // Streetlights
      { colorId: 30, r: 80, g: 80, b: 80, a: 255 },
      { colorId: 31, r: 255, g: 240, b: 180, a: 255, e: 255 },
      // Cars
      { colorId: 32, r: 120, g: 20, b: 30, a: 255 },
      { colorId: 34, r: 255, g: 240, b: 120, a: 255, e: 100 },
      { colorId: 38, r: 255, g: 60, b: 60, a: 255, e: 80 },
      // Mountains (close)
      { colorId: 35, r: 30, g: 35, b: 50, a: 255 },
      { colorId: 36, r: 40, g: 45, b: 60, a: 255 },
      { colorId: 37, r: 50, g: 55, b: 70, a: 255 },
      // Mountains (distant)
      { colorId: 47, r: 20, g: 25, b: 45, a: 255 },
      { colorId: 48, r: 25, g: 30, b: 50, a: 255 },
      { colorId: 49, r: 30, g: 35, b: 55, a: 255 },
      // Moon
      { colorId: 40, r: 220, g: 200, b: 100, a: 255, e: 255 },
      { colorId: 41, r: 180, g: 160, b: 80, a: 255, e: 40 },
      // Lightning
      { colorId: 45, r: 255, g: 255, b: 255, a: 255, e: 255 },
      { colorId: 46, r: 200, g: 220, b: 255, a: 255, e: 180 },
    ];

    engine.loadPaletteToSlot(0, palette);

    // ── Palette slot 1: Lightning flash (boosted) ──
    const lightningPalette = palette.map((c) => {
      let boost = 40,
        blueExtra = 10;
      const id = c.colorId;
      if (id >= 1 && id <= 8) {
        boost = 180;
        blueExtra = 40;
      } else if (id >= 35 && id <= 37) {
        boost = 140;
        blueExtra = 30;
      } else if (id >= 47 && id <= 49) {
        boost = 40;
        blueExtra = 15;
      } else if ((id >= 21 && id <= 23) || id === 28) {
        boost = 25;
        blueExtra = 15;
      } else if (id >= 25 && id <= 27) {
        boost = 60;
        blueExtra = 20;
      } else if (id >= 11 && id <= 18) {
        boost = 50;
        blueExtra = 15;
      } else if (id === 20) {
        boost = 100;
        blueExtra = 30;
      } else if ([24, 33, 31, 34, 38, 40, 41].includes(id)) {
        boost = 0;
        blueExtra = 0;
      }
      return {
        ...c,
        r: Math.min(255, c.r + boost),
        g: Math.min(255, c.g + boost),
        b: Math.min(255, c.b + boost + blueExtra),
      };
    });
    engine.loadPaletteToSlot(1, lightningPalette);

    // ── Register multicolor sprites ──
    const reg = engine.getSpriteRegistry();
    reg.loadMulticolorSprites([
      ...this.generateBuildingSprites(),
      ...this.generateMountainSprites(201, [C.MTN_1, C.MTN_2, C.MTN_3]),
      ...this.generateMountainSprites(204, [C.MTN_D1, C.MTN_D2, C.MTN_D3]),
      ...this.generateCarSprites(),
      this.generateStreetlightSprite(),
    ]);

    runtime.setTickRate(TICK_RATE);
  }

  // ─────────────────────────────────────────────────────────────────────
  // INIT USER
  // ─────────────────────────────────────────────────────────────────────

  initUser(
    _runtime: IRuntime,
    _engine: Engine,
    user: User<CityUserData>,
  ): void {
    const layers = new Map<string, Layer>();

    // ── Display ──
    const display = new Display(0, 80, DEFAULT_H);
    user.addDisplay(display);
    display.switchPalette(0);
    display.setScalingMode(ScalingMode.Responsive);
    display.setCellSize(12, 12);
    display.setOrigin(new Vector2(0, 10));
    display.setRenderPasses([
      { id: 0, zMin: 0, zMax: 3 }, // Sky, moon, lightning, distant mountains
      { id: 1, zMin: 4, zMax: 7 }, // Mountains, grass, buildings
      { id: 2, zMin: 8, zMax: 11 }, // Road, streetlights, cars
      { id: 3, zMin: 12, zMax: 15 }, // Rain overlay
    ]);
    display.setPostProcess({
      scanlines: {
        enabled: true,
        opacity: 0.35,
        pattern: "horizontal",
        spacing: 5,
        thickness: 2,
        color: { r: 20, g: 30, b: 40 },
      },
    });
    display.setAmbientEffect({ blur: 40, scale: 4 });
    display.setAmbientEffectEnabled(true);

    // ── Layers ──
    const layerOffset = new Vector2(0, 10);

    const addLayer = (
      name: string,
      z: number,
      w: number,
      h: number,
      opts: any = {},
    ) => {
      const layer = new Layer(layerOffset, z, w, h, opts);
      layers.set(name, layer);
      user.addLayer(layer);
      return layer;
    };

    addLayer("sky", 1, WORLD_W, LAYER_H, { mustBeReliable: true });
    addLayer("moon", 2, 32, 32, { mustBeReliable: true });
    addLayer("lightning", 2, WORLD_W, LAYER_H, { mustBeReliable: false });
    addLayer("distant-mountains", 3, WORLD_W, LAYER_H, {
      mustBeReliable: true,
    });
    addLayer("mountains", 4, WORLD_W, LAYER_H, { mustBeReliable: true });
    addLayer("grass", 5, WORLD_W, LAYER_H, { mustBeReliable: true });
    addLayer("buildings", 6, WORLD_W, LAYER_H, { mustBeReliable: true });
    addLayer("road", 7, WORLD_W, LAYER_H, { mustBeReliable: true });
    addLayer("streetlights", 8, WORLD_W, LAYER_H, { mustBeReliable: true });
    addLayer("cars", 9, WORLD_W, LAYER_H, { mustBeReliable: false });
    addLayer("rain", 13, WORLD_W, LAYER_H, { mustBeReliable: false });

    // ── Input bindings ──
    const reg = user.getInputBindingRegistry();
    reg.defineAxis(
      0,
      "MoveX",
      [
        {
          sourceId: 0,
          type: InputDeviceType.Keyboard,
          negativeKey: KeyboardInput.ArrowLeft,
          positiveKey: KeyboardInput.ArrowRight,
        },
      ],
      -1,
      1,
      0,
    );
    reg.defineButton(0, "MouseDrag", [
      {
        sourceId: 0,
        type: InputDeviceType.Mouse,
        mouseButton: MouseInput.LeftButton,
      },
    ]);
    reg.defineButton(1, "TouchDrag", [
      { sourceId: 1, type: InputDeviceType.Touch, touchButton: 0 },
    ]);
    reg.defineButton(2, "Lightning", [
      { sourceId: 2, type: InputDeviceType.Keyboard, key: KeyboardInput.KeyL },
    ]);

    // ── User data ──
    user.data = {
      display,
      layers,
      mouseDragActive: false,
      mouseDragAnchorWorldX: 0,
      mouseDragAnchorLocalX: 0,
      touchDragActive: false,
      touchDragAnchorWorldX: 0,
      touchDragAnchorLocalX: 0,
      displayW: 80,
      displayH: DEFAULT_H,
      cellSize: CELL_NORMAL,
      lightningActive: false,
      lightningPhase: 0,
      lightningTimer: 0,
      lightningX: 0,
      lastThunderTime: 0,
      rainDrops: this.initRainDrops(80, DEFAULT_H),
      mountainsData: [
        { spriteIndex: 201, posX: 0, sizeY: 30 },
        { spriteIndex: 203, posX: 55, sizeY: 24 },
        { spriteIndex: 202, posX: 100, sizeY: 36 },
        { spriteIndex: 201, posX: 160, sizeY: 30 },
        { spriteIndex: 203, posX: 210, sizeY: 24 },
      ],
      distantMountainsData: [
        { spriteIndex: 205, posX: -10, sizeY: 36 },
        { spriteIndex: 204, posX: 40, sizeY: 30 },
        { spriteIndex: 206, posX: 90, sizeY: 24 },
        { spriteIndex: 205, posX: 130, sizeY: 36 },
      ],
    } as CityUserData;

    // ── Initial static renders ──
    this.renderSky(user);
    this.renderMoon(user);
    this.renderDistantMountains(user);
    this.renderMountains(user);
    this.renderGrass(user);
    this.renderBuildings(user);
    this.renderRoad(user);
    this.renderStreetlights(user);
  }

  // ─────────────────────────────────────────────────────────────────────
  // GLOBAL UPDATE (physics, cars)
  // ─────────────────────────────────────────────────────────────────────

  update(_runtime: IRuntime, _engine: Engine): void {
    // Spawn cars randomly
    if (Math.random() < 0.02) {
      const dir = Math.random() < 0.5 ? 1 : -1;
      const speed = Math.random() < 0.5 ? 1 : 2;
      const carColors = [
        { color: 2, rightId: 50, leftId: 53 }, // Blue
        { color: 30, rightId: 51, leftId: 54 }, // Gray
        { color: 32, rightId: 52, leftId: 55 }, // Red
      ];
      const pick = carColors[Math.floor(Math.random() * carColors.length)];
      this.cars.push({
        x: dir === 1 ? -8 : WORLD_W + 2,
        lane: dir === 1 ? 1 : 0,
        speed,
        direction: dir,
        spriteId: dir === 1 ? pick.rightId : pick.leftId,
      });
    }
    // Move & cull
    this.cars = this.cars
      .map((c) => ({ ...c, x: c.x + c.speed * c.direction }))
      .filter((c) => c.x >= -10 && c.x <= WORLD_W + 10);
  }

  // ─────────────────────────────────────────────────────────────────────
  // PER-USER UPDATE
  // ─────────────────────────────────────────────────────────────────────

  updateUser(
    _runtime: IRuntime,
    _engine: Engine,
    user: User<CityUserData>,
  ): void {
    const d = user.data;
    const display = d.display;

    // ── Adaptive cell size ──
    const w = display.width;
    const h = display.height;
    const containerW = w * d.cellSize;
    const containerH = h * d.cellSize;

    let targetCell = CELL_NORMAL;
    if (
      containerH < MIN_DISPLAY_H * CELL_NORMAL ||
      containerW < MIN_DISPLAY_W * CELL_NORMAL
    ) {
      targetCell = CELL_SMALL;
    }
    if (
      containerH < MIN_DISPLAY_H * CELL_SMALL ||
      containerW < MIN_DISPLAY_W * CELL_SMALL
    ) {
      targetCell = CELL_TINY;
    }
    if (targetCell !== d.cellSize) {
      d.cellSize = targetCell;
      display.setCellSize(targetCell, targetCell);
    }

    // ── Responsive resize ──
    if (w !== d.displayW || h !== d.displayH) {
      d.displayW = w;
      d.displayH = h;
      // Re-init rain for new dimensions
      d.rainDrops = this.initRainDrops(w, h);
      // Re-render all statics
      this.renderSky(user);
      this.renderMoon(user);
      this.renderDistantMountains(user);
      this.renderMountains(user);
      this.renderGrass(user);
      this.renderBuildings(user);
      this.renderRoad(user);
      this.renderStreetlights(user);
    }

    // ── Input: horizontal scrolling ──
    const moveX = user.getAxis("MoveX");
    const origin = display.getOrigin();
    const mouseInfo = user.getMouseDisplayInfo();
    const touchInfo = user.getTouchDisplayInfo(0);
    const isMousePressed = user.getButton("MouseDrag");
    const isTouchPressed = user.getButton("TouchDrag");

    let totalMoveX = 0;

    // Keyboard
    if (moveX !== 0) totalMoveX += moveX * 2;

    // Mouse drag (sticky system)
    if (isMousePressed && mouseInfo) {
      if (!d.mouseDragActive) {
        d.mouseDragActive = true;
        d.mouseDragAnchorWorldX = origin.x + mouseInfo.localX;
        d.mouseDragAnchorLocalX = mouseInfo.localX;
      }
      const targetX = d.mouseDragAnchorWorldX - mouseInfo.localX;
      totalMoveX += targetX - origin.x;
    } else {
      d.mouseDragActive = false;
    }

    // Touch drag (sticky system)
    if (isTouchPressed && touchInfo) {
      if (!d.touchDragActive) {
        d.touchDragActive = true;
        d.touchDragAnchorWorldX = origin.x + touchInfo.localX;
        d.touchDragAnchorLocalX = touchInfo.localX;
      }
      const targetX = d.touchDragAnchorWorldX - touchInfo.localX;
      totalMoveX += targetX - origin.x;
    } else {
      d.touchDragActive = false;
    }

    // Apply movement
    let displayMoved = false;
    if (totalMoveX !== 0) {
      const maxScroll = WORLD_W - d.displayW;
      let newX = Math.floor(
        Math.max(0, Math.min(maxScroll, origin.x + totalMoveX)),
      );
      if (newX !== origin.x) {
        display.setOrigin(new Vector2(newX, 10));
        displayMoved = true;
      }
    }

    // ── Parallax ──
    if (displayMoved) {
      const pos = display.getOrigin();

      const mtnLayer = d.layers.get("mountains");
      if (mtnLayer) {
        mtnLayer.setOrigin(new Vector2(Math.floor(pos.x * 0.5), 10));
        mtnLayer.commit();
      }

      const distMtnLayer = d.layers.get("distant-mountains");
      if (distMtnLayer) {
        distMtnLayer.setOrigin(new Vector2(Math.floor(pos.x * 0.85), 10));
        distMtnLayer.commit();
      }

      const moonLayer = d.layers.get("moon");
      if (moonLayer) {
        moonLayer.setOrigin(new Vector2(pos.x, 10));
        moonLayer.commit();
      }

      // Camera-following layers
      for (const name of ["cars", "rain"]) {
        const layer = d.layers.get(name);
        if (layer) {
          layer.setOrigin(new Vector2(pos.x, 10));
          layer.commit();
        }
      }
    }

    // ── Lightning (L key or random) ──
    const now = Date.now();
    const wantsLightning = user.isJustPressed("Lightning");
    const autoLightning =
      now - d.lastThunderTime > 30000 && Math.random() < 0.01;

    if ((wantsLightning || autoLightning) && !d.lightningActive) {
      d.lightningActive = true;
      d.lightningPhase = 1;
      d.lightningTimer = now;
      d.lightningX = 20 + Math.floor(Math.random() * 216);
      d.lastThunderTime = now;
      display.switchPalette(1);
    }

    if (d.lightningActive) {
      const elapsed = now - d.lightningTimer;
      if (d.lightningPhase === 1 && elapsed > 50) {
        display.switchPalette(0);
        d.lightningPhase = 2;
        d.lightningTimer = now;
      } else if (d.lightningPhase === 2 && elapsed > 80) {
        display.switchPalette(1);
        d.lightningPhase = 3;
        d.lightningTimer = now;
      } else if (d.lightningPhase === 3 && elapsed > 40) {
        display.switchPalette(0);
        d.lightningActive = false;
        d.lightningPhase = 0;
      }
    }

    // ── Render dynamic layers ──
    this.renderLightning(user);
    this.renderCars(user);
    this.renderRain(user);
  }

  // ─────────────────────────────────────────────────────────────────────
  // STATIC RENDER METHODS
  // ─────────────────────────────────────────────────────────────────────

  private renderSky(user: User<CityUserData>): void {
    const layer = user.data.layers.get("sky")!;
    const h = user.data.displayH;
    const steps = 8;
    const orders: any[] = [];
    for (let i = 0; i < steps; i++) {
      const yStart = Math.floor((i * h) / steps);
      const yEnd = Math.floor(((i + 1) * h) / steps);
      orders.push(
        OrderBuilder.rect(
          0,
          yStart,
          WORLD_W,
          yEnd - yStart,
          " ",
          C.SKY_1 + i,
          C.SKY_1 + i,
          true,
        ),
      );
    }
    layer.setOrders(orders);
    layer.commit();
  }

  private renderMoon(user: User<CityUserData>): void {
    const layer = user.data.layers.get("moon")!;
    const mx = 10,
      my = 2,
      sz = 6;
    const orders: any[] = [
      OrderBuilder.rect(mx, my, sz, sz, " ", C.MOON, C.MOON, true),
      OrderBuilder.rect(
        mx + 1,
        my + 2,
        2,
        1,
        " ",
        C.MOON_CRATER,
        C.MOON_CRATER,
        true,
      ),
      OrderBuilder.rect(
        mx + 3,
        my + 4,
        1,
        1,
        " ",
        C.MOON_CRATER,
        C.MOON_CRATER,
        true,
      ),
      OrderBuilder.rect(
        mx + 4,
        my + 1,
        1,
        2,
        " ",
        C.MOON_CRATER,
        C.MOON_CRATER,
        true,
      ),
      OrderBuilder.rect(
        mx + 2,
        my + 5,
        2,
        1,
        " ",
        C.MOON_CRATER,
        C.MOON_CRATER,
        true,
      ),
    ];
    layer.setOrders(orders);
    layer.commit();
  }

  private renderDistantMountains(user: User<CityUserData>): void {
    const layer = user.data.layers.get("distant-mountains")!;
    const baseY = user.data.displayH - ROAD_HEIGHT + 2;
    const sprites = user.data.distantMountainsData.map((m) => ({
      spriteIndex: m.spriteIndex,
      posX: m.posX,
      posY: baseY - m.sizeY,
    }));
    layer.setOrders([OrderBuilder.spriteCloudVariedMulti(sprites)]);
    layer.commit();
  }

  private renderMountains(user: User<CityUserData>): void {
    const layer = user.data.layers.get("mountains")!;
    const baseY = user.data.displayH - ROAD_HEIGHT;
    const sprites = user.data.mountainsData.map((m) => ({
      spriteIndex: m.spriteIndex,
      posX: m.posX,
      posY: baseY - m.sizeY,
    }));
    layer.setOrders([OrderBuilder.spriteCloudVariedMulti(sprites)]);
    layer.commit();
  }

  private renderGrass(user: User<CityUserData>): void {
    const layer = user.data.layers.get("grass")!;
    const y = user.data.displayH - ROAD_HEIGHT - GRASS_HEIGHT;
    layer.setOrders([
      OrderBuilder.rect(
        0,
        y,
        WORLD_W,
        GRASS_HEIGHT,
        " ",
        C.GRASS_1,
        C.GRASS_1,
        true,
      ),
    ]);
    layer.commit();
  }

  private renderBuildings(user: User<CityUserData>): void {
    const layer = user.data.layers.get("buildings")!;
    const groundY = user.data.displayH - ROAD_HEIGHT;

    // Sprite heights match generateBuildingSprites configs
    const spriteHeights = [
      20, 24, 22, 18, 16, 18, 15, 17, 12, 14, 13, 28, 26, 25, 20, 16, 19, 21,
      23, 17,
    ];
    const placements = [
      { x: 0, id: 15 },
      { x: 12, id: 2 },
      { x: 25, id: 9 },
      { x: 42, id: 12 },
      { x: 56, id: 5 },
      { x: 72, id: 18 },
      { x: 86, id: 11 },
      { x: 102, id: 13 },
      { x: 117, id: 7 },
      { x: 132, id: 1 },
      { x: 145, id: 14 },
      { x: 160, id: 6 },
      { x: 176, id: 19 },
      { x: 192, id: 4 },
      { x: 205, id: 10 },
      { x: 222, id: 16 },
      { x: 235, id: 8 },
      { x: 250, id: 3 },
    ];
    const sprites = placements.map((b) => ({
      posX: b.x,
      posY: groundY - spriteHeights[b.id - 1],
      spriteIndex: b.id,
    }));
    layer.setOrders([OrderBuilder.spriteCloudVariedMulti(sprites)]);
    layer.commit();
  }

  private renderRoad(user: User<CityUserData>): void {
    const layer = user.data.layers.get("road")!;
    const roadY = user.data.displayH - ROAD_HEIGHT;
    const orders: any[] = [
      // Asphalt
      OrderBuilder.rect(
        0,
        roadY,
        WORLD_W,
        ROAD_HEIGHT,
        " ",
        C.ROAD,
        C.ROAD,
        true,
      ),
    ];
    // Dashed center line
    const centerY = roadY + 2;
    for (let x = 0; x < WORLD_W; x += 6) {
      for (let i = 0; i < 3 && x + i < WORLD_W; i++) {
        orders.push(OrderBuilder.char(x + i, centerY, " ", 255, C.ROAD_LINE));
      }
    }
    layer.setOrders(orders);
    layer.commit();
  }

  private renderStreetlights(user: User<CityUserData>): void {
    const layer = user.data.layers.get("streetlights")!;
    const baseY = user.data.displayH - ROAD_HEIGHT;
    const spriteHeight = 13;
    const positions = [
      5, 25, 45, 65, 85, 105, 125, 145, 165, 185, 205, 225, 245,
    ];
    const sprites = positions.map((x) => ({
      spriteIndex: 100,
      posX: x,
      posY: baseY - spriteHeight,
    }));
    layer.setOrders([OrderBuilder.spriteCloudVariedMulti(sprites)]);
    layer.commit();
  }

  // ─────────────────────────────────────────────────────────────────────
  // DYNAMIC RENDER METHODS
  // ─────────────────────────────────────────────────────────────────────

  private renderLightning(user: User<CityUserData>): void {
    const layer = user.data.layers.get("lightning")!;
    const d = user.data;
    const orders: any[] = [OrderBuilder.fill(" ", 255, 255)];

    if (!d.lightningActive) {
      layer.setOrders(orders);
      layer.commit();
      return;
    }

    const boltX = d.lightningX;
    const groundY = d.displayH - ROAD_HEIGHT;
    let cx = boltX,
      cy = 0;
    const seed = boltX;
    const segments: { x: number; y: number }[] = [{ x: cx, y: cy }];
    const stepBase = Math.max(3, Math.floor(groundY / 12));

    while (cy < groundY) {
      cy = Math.min(groundY, cy + stepBase + ((seed + cy) % 4));
      const zig = ((seed + cy) % 2 === 0 ? 1 : -1) * (2 + ((seed + cy) % 3));
      cx = Math.max(5, Math.min(250, cx + zig));
      segments.push({ x: cx, y: cy });
    }

    // Draw bolt
    for (let i = 0; i < segments.length - 1; i++) {
      const s = segments[i],
        e = segments[i + 1];
      const dx = e.x - s.x,
        dy = e.y - s.y;
      const steps = Math.max(Math.abs(dx), dy);
      for (let t = 0; t <= steps; t++) {
        const frac = steps === 0 ? 0 : t / steps;
        const px = Math.round(s.x + dx * frac);
        const py = Math.round(s.y + dy * frac);
        orders.push(OrderBuilder.char(px - 1, py, " ", 255, C.BOLT_GLOW));
        orders.push(OrderBuilder.char(px + 1, py, " ", 255, C.BOLT_GLOW));
        orders.push(OrderBuilder.char(px, py, " ", 255, C.BOLT_CORE));
      }
    }

    // Branches
    for (let i = 1; i < segments.length - 1; i += 2) {
      const br = segments[i];
      const dir = (seed + i) % 2 === 0 ? 1 : -1;
      const brLen = Math.max(3, Math.floor(groundY / 15)) + ((seed + i) % 4);
      for (let b = 1; b <= brLen; b++) {
        const bx = br.x + dir * b;
        const by = br.y + Math.floor(b * 0.5);
        if (bx >= 0 && bx < WORLD_W && by <= groundY) {
          orders.push(OrderBuilder.char(bx, by, " ", 255, C.BOLT_GLOW));
        }
      }
    }

    layer.setOrders(orders);
    layer.commit();
  }

  private renderCars(user: User<CityUserData>): void {
    const layer = user.data.layers.get("cars")!;
    const d = user.data;
    const origin = d.display.getOrigin();
    const displayX = origin.x;
    const roadY = d.displayH - ROAD_HEIGHT;

    const visible = this.cars.filter(
      (c) => c.x + 6 >= displayX - 6 && c.x < displayX + d.displayW + 6,
    );

    if (visible.length === 0) {
      layer.setOrders([OrderBuilder.fill(" ", 255, 255)]);
      layer.commit();
      return;
    }

    const sprites = visible.map((c) => ({
      posX: Math.floor(c.x - displayX),
      posY: roadY + (c.lane === 0 ? 0 : 2),
      spriteIndex: c.spriteId,
    }));

    layer.setOrders([OrderBuilder.spriteCloudVariedMulti(sprites)]);
    layer.commit();
  }

  private renderRain(user: User<CityUserData>): void {
    const layer = user.data.layers.get("rain")!;
    const d = user.data;
    const w = d.displayW;
    const h = d.displayH;

    // Update rain positions
    for (const drop of d.rainDrops) {
      drop.y += drop.speed;
      if (drop.y >= h) {
        drop.y = -1 - Math.random() * 10;
        drop.x = Math.random() * w;
      }
    }

    // Build dot cloud
    const dots = d.rainDrops
      .filter((r) => r.y >= 0 && r.y < h && r.x >= 0 && r.x < w)
      .map((r) => ({
        posX: Math.floor(r.x),
        posY: Math.floor(r.y),
        charCode: ":" as string | number,
        fgColorCode: C.RAIN,
        bgColorCode: 255,
      }));

    if (dots.length > 0) {
      layer.setOrders([OrderBuilder.dotCloudMulti(dots)]);
    } else {
      layer.setOrders([OrderBuilder.fill(" ", 255, 255)]);
    }
    layer.commit();
  }

  // ─────────────────────────────────────────────────────────────────────
  // RAIN INITIALIZATION
  // ─────────────────────────────────────────────────────────────────────

  private initRainDrops(
    w: number,
    h: number,
  ): { x: number; y: number; speed: number }[] {
    const count = Math.floor(w * h * 0.04);
    const drops: { x: number; y: number; speed: number }[] = [];
    for (let i = 0; i < count; i++) {
      drops.push({
        x: Math.random() * w,
        y: Math.random() * h,
        speed: 0.8 + Math.random() * 0.6,
      });
    }
    return drops;
  }

  // ─────────────────────────────────────────────────────────────────────
  // SPRITE GENERATORS
  // ─────────────────────────────────────────────────────────────────────

  /** Generate 20 building sprites (IDs 1–20) */
  private generateBuildingSprites() {
    const configs = [
      { w: 9, h: 20, body: C.BLDG_2 },
      { w: 11, h: 24, body: C.BLDG_1 },
      { w: 9, h: 22, body: C.BLDG_3 },
      { w: 7, h: 18, body: C.BLDG_2 },
      { w: 13, h: 16, body: C.BLDG_1 },
      { w: 15, h: 18, body: C.BLDG_2 },
      { w: 11, h: 15, body: C.BLDG_3 },
      { w: 13, h: 17, body: C.BLDG_1 },
      { w: 15, h: 12, body: C.BLDG_2 },
      { w: 17, h: 14, body: C.BLDG_3 },
      { w: 15, h: 13, body: C.BLDG_1 },
      { w: 11, h: 28, body: C.BLDG_1 },
      { w: 13, h: 26, body: C.BLDG_2 },
      { w: 9, h: 25, body: C.BLDG_3 },
      { w: 11, h: 20, body: C.BLDG_2 },
      { w: 9, h: 16, body: C.BLDG_1 },
      { w: 13, h: 19, body: C.BLDG_3 },
      { w: 11, h: 21, body: C.BLDG_2 },
      { w: 15, h: 23, body: C.BLDG_1 },
      { w: 13, h: 17, body: C.BLDG_3 },
    ];

    return configs.map((cfg, i) => {
      const w = cfg.w % 2 === 0 ? cfg.w + 1 : cfg.w;
      const data: { charCode: string; fgColorId: number; bgColorId: number }[] =
        [];

      for (let y = 0; y < cfg.h; y++) {
        for (let x = 0; x < w; x++) {
          let bg: number;
          if (x < 2) {
            bg = C.BLDG_SHADOW;
          } else if (
            x > 1 &&
            y > 1 &&
            y < cfg.h - 2 &&
            x < w - 1 &&
            (x - 2) % 2 === 1 &&
            y % 2 === 0
          ) {
            bg = Math.random() < 0.5 ? C.WIN_DIM : C.WIN_LIT;
          } else {
            bg = cfg.body;
          }
          data.push({ charCode: "#", fgColorId: bg, bgColorId: bg });
        }
      }

      return { spriteId: i + 1, width: w, height: cfg.h, data };
    });
  }

  /** Generate 3 mountain sprites at the given base ID */
  private generateMountainSprites(baseId: number, colors: readonly number[]) {
    const configs = [
      { sizeX: 63, sizeY: 30 },
      { sizeX: 75, sizeY: 36 },
      { sizeX: 57, sizeY: 24 },
    ];

    return configs.map((cfg, i) => {
      const data: { charCode: string; fgColorId: number; bgColorId: number }[] =
        [];
      const color = colors[i];
      let prevOff = 0;

      for (let y = 0; y < cfg.sizeY; y++) {
        const lineW = Math.floor((cfg.sizeX * (y + 1)) / cfg.sizeY);
        let off = prevOff + Math.floor((Math.random() - 0.5) * 2);
        off = Math.max(
          -Math.floor(cfg.sizeX / 8),
          Math.min(Math.floor(cfg.sizeX / 8), off),
        );
        prevOff = off;
        const xStart = Math.floor((cfg.sizeX - lineW) / 2) + off;
        const xEnd = xStart + lineW;

        for (let x = 0; x < cfg.sizeX; x++) {
          if (x >= xStart && x < xEnd) {
            data.push({ charCode: "#", fgColorId: color, bgColorId: color });
          } else {
            data.push({ charCode: " ", fgColorId: 255, bgColorId: 255 });
          }
        }
      }

      return {
        spriteId: baseId + i,
        width: cfg.sizeX,
        height: cfg.sizeY,
        data,
      };
    });
  }

  /** Generate 6 car sprites (3 colors x 2 directions, IDs 50–55) */
  private generateCarSprites() {
    const carW = 6,
      carH = 3;
    const colors = [
      { bodyColor: 2, rightId: 50, leftId: 53 }, // Blue
      { bodyColor: C.SIDEWALK, rightId: 51, leftId: 54 }, // Gray
      { bodyColor: C.CAR_RED, rightId: 52, leftId: 55 }, // Red
    ];

    const sprites: any[] = [];

    for (const c of colors) {
      for (const dir of ["right", "left"] as const) {
        const id = dir === "right" ? c.rightId : c.leftId;
        const data: {
          charCode: string;
          fgColorId: number;
          bgColorId: number;
        }[] = [];

        for (let y = 0; y < carH; y++) {
          for (let x = 0; x < carW; x++) {
            // Transparent corners on top row
            if (y === 0 && (x === 0 || x === carW - 1)) {
              data.push({ charCode: " ", fgColorId: 255, bgColorId: 255 });
              continue;
            }

            let bg = c.bodyColor;
            if (y === 1) {
              const frontX = dir === "right" ? carW - 1 : 0;
              const rearX = dir === "right" ? 0 : carW - 1;
              if (x === frontX) bg = C.CAR_HEADLIGHT;
              else if (x === rearX) bg = C.CAR_TAILLIGHT;
            }

            data.push({ charCode: "#", fgColorId: bg, bgColorId: bg });
          }
        }

        sprites.push({ spriteId: id, width: carW, height: carH, data });
      }
    }

    return sprites;
  }

  /** Generate the streetlight sprite (ID 100) */
  private generateStreetlightSprite() {
    const w = 4,
      h = 13;
    const data: { charCode: string; fgColorId: number; bgColorId: number }[] =
      [];

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let charCode = " ";
        let fg = 255,
          bg = 255;

        // Lamp bulb
        if (y === 2 && x === 3) {
          bg = C.LAMP;
        }
        // Horizontal arm
        else if (y === 1 && x >= 1 && x <= 3) {
          charCode = "-";
          fg = C.POLE;
        }
        // Vertical pole
        else if (x === 1 && y >= 2) {
          charCode = "|";
          fg = C.POLE;
        }

        data.push({ charCode, fgColorId: fg, bgColorId: bg });
      }
    }

    return { spriteId: 100, width: w, height: h, data };
  }
}
