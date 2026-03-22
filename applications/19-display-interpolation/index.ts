import {
    Engine,
    User,
    Layer,
    Display,
    OrderBuilder,
    Vector2,
    type IApplication,
    type IRuntime,
} from "@primitiv/engine";

interface InterpolationData {
    slots: {
        groundLayers: Layer[];
        uiLayer: Layer;
    }[];
    tickCount: number;
}

/**
 * Name: 19-display-interpolation
 * Description: ⚠️ EXPERIMENTAL: Avoid in production. Smoothens background rendering when a camera follows a player.
 *   Uses an infinite "rolling log" pattern to recycle layers as the camera moves.
 */
export class InterpolationShowcase implements IApplication<Engine, User<InterpolationData>> {

    async init(_runtime: IRuntime, engine: Engine): Promise<void> {
        engine.loadPaletteToSlot(0, [
            { colorId: 0, r: 5, g: 5, b: 12, a: 255 },      // Deep Bg
            { colorId: 1, r: 255, g: 255, b: 255, a: 255 }, // White
            { colorId: 2, r: 0, g: 255, b: 240, a: 255 },   // Bright Cyan
            { colorId: 3, r: 255, g: 180, b: 0, a: 255 },   // Bright Orange
            { colorId: 4, r: 255, g: 80, b: 150, a: 255 },  // Bright Pink
            { colorId: 5, r: 100, g: 120, b: 180, a: 255 }, // Visible Grid
        ]);

        _runtime.setTickRate(20);
    }

    async initUser(_runtime: IRuntime, _engine: Engine, user: User<InterpolationData>): Promise<void> {
        const slots = [];
        const ticks = [0, 1, 2, 4];

        for (let i = 0; i < 4; i++) {
            const d = new Display(i, 64, 36);
            user.addDisplay(d);
            d.switchPalette(0);

            if (ticks[i] > 0) {
                d.setInterpolation(true);
                d.setInterpolationTicks(ticks[i]);
            } else {
                d.setInterpolation(false);
            }

            const startY = (i + 1) * 1000;
            const startZ = i * 4;

            // 3 Ground layers per slot (256x256)
            const groundLayers: Layer[] = [];
            for (let j = 0; j < 3; j++) {
                const zIndex = startZ + j;
                const startX = j * 256;
                const layer = new Layer(new Vector2(startX, startY), zIndex, 256, 256);
                user.addLayer(layer);
                groundLayers.push(layer);
                this.drawGroundChunk(layer, startX, startY);
            }

            // 1 UI layer for characters/labels (256x256)
            const uiLayer = new Layer(new Vector2(0, startY), startZ + 3, 256, 256);
            user.addLayer(uiLayer);

            d.setRenderPasses([
                { id: 0, zMin: startZ, zMax: startZ + 2 }, // Background (Rondins)
                { id: 1, zMin: startZ + 3, zMax: startZ + 3 } // UI/Player LAYER
            ]);

            slots.push({ groundLayers, uiLayer });
        }

        user.data = { slots, tickCount: 0 };
    }

    private drawGroundChunk(layer: Layer, startX: number, startY: number) {
        const W = 256;
        const H = 256;

        // functional filling
        const frameData = Array.from({ length: W * H }, (_, i) => {
            const lx = i % W;
            const ly = Math.floor(i / W);
            const wx = startX + lx;
            const wy = startY + ly;

            let rand = (wx * 17 + wy * 31337) >>> 0;
            rand = (rand * 1664525 + 1013904223) >>> 0;
            const noise = (rand >>> 0) / 4294967300;

            let charCode = 32;
            let fgColorCode = 0;
            let bgColorCode = 0;

            if (noise > 0.94) {
                charCode = OrderBuilder.toCharCode(noise > 0.97 ? "▒" : "░");
                fgColorCode = 5;
            }

            const isVert = (wx % 64 <= 1 || wx % 64 >= 63);
            const isHoriz = (wy % 64 <= 1 || wy % 64 >= 63);

            if (isVert || isHoriz) {
                const isIntersection = isVert && isHoriz;
                charCode = OrderBuilder.toCharCode(isIntersection ? "▓" : "▒");
                fgColorCode = isIntersection ? 1 : (isVert ? 3 : 2);
            }

            return { charCode, fgColorCode, bgColorCode };
        });

        layer.setOrders([
            OrderBuilder.fullFrameMulti(frameData, {
                compression: { chars: 2, fg: 2, bg: 2 }
            })
        ]);
    }

    update(): void { }

    updateUser(_runtime: IRuntime, _engine: Engine, user: User<InterpolationData>): void {
        const d = user.data;
        if (!d) return;

        d.tickCount++;
        const tick = d.tickCount;

        const labels = ["NO INTERP", "INTERP 1", "INTERP 2", "INTERP 4"];
        const colors = [2, 3, 4, 1];

        const INTERVAL = 4;
        const simTick = Math.floor(tick / INTERVAL) * INTERVAL;
        const targetX = simTick / INTERVAL;

        for (let i = 0; i < 4; i++) {
            const display = user.getDisplay(i);
            if (!display) continue;

            const startY = (i + 1) * 1000;
            const targetY = startY + 18;

            const camX = Math.max(0, targetX - 32);
            const camY = startY;

            display.setOrigin(new Vector2(camX, camY));

            const slot = d.slots[i];
            slot.uiLayer.setOrigin(new Vector2(camX, camY));

            // Rondin Recycling
            for (const groundLayer of slot.groundLayers) {
                const origin = groundLayer.getOrigin();
                if (origin.x + 256 < camX) {
                    let maxX = -1;
                    for (const gl of slot.groundLayers) {
                        const ox = gl.getOrigin().x;
                        if (ox > maxX) maxX = ox;
                    }
                    const newX = maxX + 256;
                    groundLayer.setOrigin(new Vector2(newX, startY));
                    this.drawGroundChunk(groundLayer, newX, startY);
                }
            }

            // UI and Player Rendering - Coordinates are LOCAL to the layer (0,0 is its origin)
            const lx = targetX - camX; // Character relative X (usually 32)
            const ly = targetY - camY; // Character relative Y (usually 18)

            slot.uiLayer.setOrders([
                // Title bar at the top of the view
                OrderBuilder.rect(0, 0, 64, 1, " ", 0, colors[i], true),
                OrderBuilder.text(1, 0, `[${i}] ${labels[i]} | X: ${targetX}`, 0, colors[i]),
                OrderBuilder.text(2, 2, `Ticks: ${tick}`, colors[i], 0),

                // THE PLAYER (☻) centered in the view
                OrderBuilder.text(lx, ly, "☻", colors[i], 1),
                OrderBuilder.text(lx, ly + 2, `P${i + 1}`, colors[i], 0)
            ]);
        }
    }

    async destroyUser() { }
}
