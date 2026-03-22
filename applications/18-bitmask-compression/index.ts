/**
 * Name: 18-bitmask-compression
 * Category: showcase
 * Description: Demonstrates Bitmask, Bitmask4, and Bitmask16 orders 
 *   combined with Frame Compression across 6 scènes (Compressible vs Uncompressible).
 */
import {
  Engine,
  Layer,
  OrderBuilder,
  User,
  Display,
  Vector2,
  InputDeviceType,
  KeyboardInput,
  type IApplication,
  type IRuntime,
  FrameCompression,
  type Order
} from '@primitiv/engine';

interface BitmaskCompressionData {
  layer: Layer;
  compression: FrameCompression;
  scene: number;
}

export class BitmaskCompressionShowcase implements IApplication<Engine, User<BitmaskCompressionData>> {
  // Pre-cached order sets: [sceneIndex-1][compressionModeIndex][orderIndex]
  // compressionModeIndex: 0 = No, 1 = Auto
  private cachedSets: Order[][][] = [];

  async init(runtime: IRuntime, engine: Engine) {
    const palette = [
      { colorId: 0, r: 10, g: 10, b: 18, a: 255 },    // Background
      { colorId: 1, r: 240, g: 240, b: 248, a: 255 }, // White
      { colorId: 2, r: 100, g: 200, b: 255, a: 255 }, // Blue
      { colorId: 3, r: 180, g: 255, b: 180, a: 255 }, // Green
      { colorId: 4, r: 255, g: 200, b: 100, a: 255 }, // Amber
      { colorId: 5, r: 220, g: 180, b: 255, a: 255 }, // Violet
      { colorId: 6, r: 255, g: 69, b: 58, a: 255 },   // Red (OFF)
      { colorId: 7, r: 0, g: 255, b: 157, a: 255 },   // Cyan (AUTO)
      { colorId: 8, r: 255, g: 180, b: 220, a: 255 }, // Pink
      { colorId: 9, r: 60, g: 60, b: 80, a: 255 },    // Gray
    ];

    const vColors = [
      { r: 255, g: 50, b: 50 }, { r: 50, g: 255, b: 50 }, { r: 50, g: 50, b: 255 },
      { r: 255, g: 255, b: 50 }, { r: 255, g: 50, b: 255 }, { r: 50, g: 255, b: 255 },
      { r: 255, g: 150, b: 50 }, { r: 150, g: 50, b: 255 }, { r: 50, g: 255, b: 150 },
      { r: 150, g: 255, b: 50 }, { r: 255, g: 255, b: 255 }, { r: 180, g: 180, b: 180 },
      { r: 255, g: 100, b: 150 }, { r: 100, g: 200, b: 255 }, { r: 200, g: 255, b: 100 }
    ];
    for (let i = 0; i < 15; i++) {
      palette.push({ colorId: 10 + i, ...vColors[i], a: 255 });
    }

    engine.loadPaletteToSlot(0, palette);
    runtime.setTickRate(20);

    // --- Prepare 6 Scenes ---
    const SIZE = 32;
    const variant2 = [{ char: '.', fg: 8, bg: 255 }, { char: '+', fg: 4, bg: 255 }, { char: '*', fg: 2, bg: 255 }];
    const variant3 = Array.from({ length: 15 }, (_, k) => ({ char: '0', fg: 10 + k, bg: 255 }));

    // Helper for deterministic noise (Unfavorable for RLE)
    const getNoisyMask = (modulo: number, offset: number = 0) => {
      const mask = new Uint8Array(SIZE * SIZE);
      let seed = 123;
      for (let i = 0; i < mask.length; i++) {
        seed = (seed * 16807) % 2147483647;
        mask[i] = (seed % modulo) + offset;
      }
      return mask;
    };

    // Scene 1: 1-bit, Favorable (Long horizontal runs)
    const m1s = new Uint8Array(SIZE * SIZE);
    for (let y = 0; y < SIZE; y++) {
      if (Math.floor(y / 8) % 2 === 0) m1s.fill(1, y * SIZE, (y + 1) * SIZE);
    }
    // Scene 2: 1-bit, Unfavorable (Entropy/Noise)
    const m1c = getNoisyMask(2);

    // Scene 3: 4-bit, Favorable (Wide horizontal bands)
    const m2s = new Uint8Array(SIZE * SIZE);
    for (let y = 0; y < SIZE; y++) {
      m2s.fill((Math.floor(y / 8) % 4), y * SIZE, (y + 1) * SIZE);
    }
    // Scene 4: 4-bit, Unfavorable (Entropy/Noise)
    const m2c = getNoisyMask(4);

    // Scene 5: 16-bit, Favorable (Horizontal color runs)
    const m3s = new Uint8Array(SIZE * SIZE);
    for (let y = 0; y < SIZE; y++) {
      m3s.fill((Math.floor(y / 4) % 15) + 1, y * SIZE, (y + 1) * SIZE);
    }
    // Scene 6: 16-bit, Unfavorable (Entropy/Noise)
    const m3c = getNoisyMask(15, 1);

    const masks = [m1s, m1c, m2s, m2c, m3s, m3c];
    const titles = [
      "SCENE 1: Bitmask (1-bit) - Favorable (Runs)",
      "SCENE 2: Bitmask (1-bit) - Entropy (Noise)",
      "SCENE 3: Bitmask4 (2-bit) - Favorable (Bands)",
      "SCENE 4: Bitmask4 (2-bit) - Entropy (Noise)",
      "SCENE 5: Bitmask16 (4-bit) - Favorable (Palette)",
      "SCENE 6: Bitmask16 (4-bit) - Entropy (Noise)"
    ];
    const types = [1, 1, 2, 2, 3, 3]; // 1=Bitmask, 2=Bitmask4, 3=Bitmask16

    for (let s = 1; s <= 6; s++) {
      const type = types[s - 1];
      const mask = masks[s - 1];
      const title = titles[s - 1];

      // Mode 0: Compression No, Mode 1: Compression Auto
      this.cachedSets[s - 1] = [
        this.createOrders(s, FrameCompression.No, type, mask, title, variant2, variant3),
        this.createOrders(s, FrameCompression.Auto, type, mask, title, variant2, variant3)
      ];
    }
  }

  private createOrders(scene: number, comp: FrameCompression, type: number, mask: Uint8Array, title: string, v2: any[], v3: any[]): Order[] {
    const orders: Order[] = [];
    orders.push(OrderBuilder.text(4, 2, "BITMASK COMPRESSION SHOWCASE", 1, 0));
    orders.push(OrderBuilder.text(4, 4, `[1-6] SWITCH SCENE | SCENE: ${scene}`, 1, 0));
    orders.push(OrderBuilder.text(4, 5, `[SPACE] COMPRESSION: ${comp === FrameCompression.No ? "OFF" : "AUTO"}`, comp === FrameCompression.No ? 6 : 7, 0));
    orders.push(OrderBuilder.text(4, 7, title, type + 1, 0));
    orders.push(OrderBuilder.text(4, 8, "------------------------------------------------------------", 9, 0));

    if (type === 1) {
      orders.push(OrderBuilder.bitmask(4, 10, 32, 32, mask, '#', 1, 255, false, comp));
    } else if (type === 2) {
      orders.push(OrderBuilder.bitmask4(4, 10, 32, 32, mask, v2, false, comp === FrameCompression.No ? FrameCompression.No : FrameCompression.Yes));
    } else {
      orders.push(OrderBuilder.bitmask16(4, 10, 32, 32, mask, v3, false, comp));
    }
    return orders;
  }

  async initUser(_runtime: IRuntime, _engine: Engine, user: User<BitmaskCompressionData>) {
    user.addDisplay(new Display(0, 70, 48));
    const layer = new Layer(new Vector2(0, 0), 0, 70, 48);
    user.addLayer(layer);
    user.data = { layer, compression: FrameCompression.Auto, scene: 1 };

    const reg = user.getInputBindingRegistry();
    reg.defineButton(0, 'toggle', [{ sourceId: 0, type: InputDeviceType.Keyboard, key: KeyboardInput.Space }]);
    for (let i = 1; i <= 6; i++) {
      reg.defineButton(i, `s${i}`, [{ sourceId: i, type: InputDeviceType.Keyboard, key: KeyboardInput.Digit1 + (i - 1) }]);
    }
  }

  updateUser(_runtime: IRuntime, _engine: Engine, user: User<BitmaskCompressionData>) {
    const d = user.data;
    if (user.isJustPressed('toggle')) d.compression = d.compression === FrameCompression.No ? FrameCompression.Auto : FrameCompression.No;
    for (let i = 1; i <= 6; i++) {
      if (user.isJustPressed(`s${i}`)) d.scene = i;
    }

    const modeIdx = d.compression === FrameCompression.Auto ? 1 : 0;
    d.layer.setOrders([...this.cachedSets[d.scene - 1][modeIdx]]);
  }

  update() { }
  async destroyUser() { }
}
