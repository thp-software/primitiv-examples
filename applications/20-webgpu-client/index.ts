/**
 * Name: webgpu-client
 * Category: showcase
 * Description: Demonstrates managing multiple displays (2D, GL, WGPU) simultaneously.
 *   Shows shared scene rasterized across independent viewports with a 
 *   gradient of glowing waves using dynamic palette emissive values.
 *
 * What it demonstrates (engine perspective):
 *   - The ability for a single `User` to bind and manage multiple `Display` 
 *     instances (with IDs 0, 1, 2) in the same session.
 *   - Procedural generation of palettes with progressive `e` (emissive)
 *     values to create bloom/neon gradients dynamically without shaders.
 *   - Sharing a single scene state across multiple independent render targets.
 */
import {
  Display,
  Engine,
  Layer,
  OrderBuilder,
  User,
  Vector2,
  type IApplication,
  type IRuntime,
} from "@primitiv/engine";

interface WebGpuClientUserData {
  layer: Layer;
  tick: number;
}

const DISPLAY_WIDTH = 36;
const DISPLAY_HEIGHT = 54;

export class WebGpuClientShowcase implements IApplication<
  Engine,
  User<WebGpuClientUserData>
> {
  async init(runtime: IRuntime, engine: Engine): Promise<void> {
    const palette = [
      { colorId: 0, r: 10, g: 8, b: 18, a: 255, e: 0 },
      { colorId: 1, r: 18, g: 35, b: 70, a: 255, e: 0 },
      { colorId: 2, r: 35, g: 75, b: 130, a: 255, e: 0 },
      { colorId: 3, r: 70, g: 140, b: 220, a: 255, e: 0 },
      { colorId: 4, r: 130, g: 205, b: 255, a: 255, e: 0 },
      { colorId: 5, r: 240, g: 250, b: 255, a: 255, e: 0 },
      { colorId: 6, r: 255, g: 180, b: 70, a: 255, e: 0 },
      { colorId: 7, r: 255, g: 90, b: 130, a: 255, e: 0 },
    ];

    // Generate unique colors for the 18 moving bars
    for (let i = 0; i < 18; i++) {
      const ratio = i / 17; // 0.0 to 1.0 down the screen
      palette.push({
        colorId: 8 + i,
        // Gradient from Cyan to Pink
        r: Math.floor(0 + 255 * ratio),
        g: Math.floor(255 - 150 * ratio),
        b: 255,
        a: 255,
        // Emissivity increases gradually from 0.0 to 2.5
        e: ratio * 2.5
      });
    }

    engine.loadPaletteToSlot(0, palette as any);

    runtime.setTickRate(30);
  }

  initUser(
    _runtime: IRuntime,
    _engine: Engine,
    user: User<WebGpuClientUserData>,
  ): void {
    // We only need one display (ID: 0) since this application is now
    // instantiated 3 times in 3 independent ClientRuntimes by the host component.
    const display = new Display(0, DISPLAY_WIDTH, DISPLAY_HEIGHT);
    display.switchPalette(0);
    display.setOrigin(new Vector2(0, 0));
    user.addDisplay(display);

    // Shared layer for all displays
    const layer = new Layer(new Vector2(0, 0), 0, 256, 256, {
      mustBeReliable: false,
    });
    user.addLayer(layer);

    user.data.layer = layer;
    user.data.tick = 0;
  }

  update(): void { }

  updateUser(
    _runtime: IRuntime,
    _engine: Engine,
    user: User<WebGpuClientUserData>,
  ): void {
    const { layer } = user.data;
    user.data.tick++;

    const t = user.data.tick;
    const maxX = DISPLAY_WIDTH - 1;
    const bottomY = DISPLAY_HEIGHT - 1;

    const orders = [
      OrderBuilder.fill(" ", 0, 0),
      OrderBuilder.rect(0, 0, DISPLAY_WIDTH, DISPLAY_HEIGHT, " ", 0, 1, true),
      OrderBuilder.text(2, 1, "3 RENDERERS", 6, 0),
      OrderBuilder.text(2, 3, "L: Terminal2D", 5, 0),
      OrderBuilder.text(2, 4, "M: TerminalGL", 4, 0),
      OrderBuilder.text(2, 5, "R: TerminalWGPU", 4, 0),
      OrderBuilder.text(2, 6, `Tick: ${t}`, 3, 0),
      OrderBuilder.line(2, 8, maxX - 2, 8, "-", 2, 0),
      OrderBuilder.text(2, 10, "Same engine logic", 5, 0),
      OrderBuilder.text(2, 11, "run 3 times", 5, 0),
      OrderBuilder.text(2, 12, "in parallel", 5, 0),
      OrderBuilder.line(2, 14, maxX - 2, 14, "-", 2, 0),
      OrderBuilder.text(
        2,
        bottomY - 1,
        `Size: ${DISPLAY_WIDTH}x${DISPLAY_HEIGHT}`,
        4,
        0,
      ),
    ];

    let barIndex = 0;
    for (let y = 16; y < bottomY - 3; y += 2) {
      const wave = Math.floor(Math.sin((t + y) * 0.09) * 10);
      const startX = Math.max(2, 8 + wave);
      const endX = Math.min(maxX - 2, maxX - 8 + wave);
      const barColorId = 8 + barIndex; // Uses the newly generated palette colors
      orders.push(
        OrderBuilder.line(startX, y, endX, y, "=", barColorId, 0),
      );
      barIndex++;
    }

    layer.setOrders(orders);
  }

  async destroyUser(): Promise<void> { }
}
