/**
 * @warning This feature is currently in nightly and will be officially available in Primitiv 0.21.
 * 
 * Name: 17-frame-compression
 * Category: showcase
 * Description: A technical demonstration of Primitiv's optional Frame Compression
 *   system. This showcase renders a high-density "agglomerated block" of 
 *   random data using different frame types (SubFrameMulti and FullFrameMulti) to 
 *   verify that compression remains transparent and bit-correct across all modes.
 *
 * Architecture:
 *   - Agglomerated Block: A central 80x47 region filled with high-entropy random data 
 *     (hex characters and shifting colors), ideal for exercising Frame Compression edge cases.
 *   - Background: A low-entropy background that changes based on the rendering mode 
 *     ('.' for SUB, ' ' for FULL) to provide visual feedback.
 *   - UI Overlay: A persistent dashboard showing current compression state, 
 *     rendering mode, and performance trade-offs.
 *
 * Key Primitiv Concepts demonstrated:
 *   - Transparency: compression should have zero visual impact on the final frame.
 *   - Rendering Modes: toggling between `subFrameMulti` and `fullFrameMulti`.
 *   - Frame Compression Enumerator:
 *     - `FrameCompression.No`: Disables compression entirely.
 *     - `FrameCompression.Yes`: Forces the compression algorithm to run.
 *     - `FrameCompression.Auto`: (Recommended) The system estimates if compression is 
 *       beneficial. If the data is too high-entropy, it skips compression to save 
 *       CPU cycles while maintaining bandwidth efficiency.
 *   - Layout: using `OrderBuilder.rect` and `OrderBuilder.text` for overlay positioning.
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
} from '@primitiv/engine';

// ─── Per-user application state ──────────────────────────────────────────────

interface PlayerData {
    layer: Layer;
    mode: 'sub' | 'full';
    compression: {
        chars: FrameCompression;
        fg: FrameCompression;
        bg: FrameCompression;
    };
}

// ─── Application ─────────────────────────────────────────────────────────────

export class CompressionShowcase implements IApplication<Engine, User<PlayerData>> {

    async init(runtime: IRuntime, engine: Engine) {
        // Base palette with high-contrast UI colors
        const palette = [
            { colorId: 0, r: 15, g: 15, b: 20, a: 255 },    // Deep Charcoal BG
            { colorId: 1, r: 240, g: 240, b: 245, a: 255 }, // Off-white UI
            { colorId: 5, r: 0, g: 255, b: 157, a: 255 },   // Cyber Mint (Active)
            { colorId: 6, r: 255, g: 69, b: 58, a: 255 },   // Coral Red (Inactive)
        ];

        // 16 Foreground Colors (10-25)
        const fgColors = [
            { r: 255, g: 204, b: 0 },   // Vivid Gold
            { r: 255, g: 87, b: 51 },    // Deep Orange
            { r: 218, g: 247, b: 166 }, // Pale Lime
            { r: 199, g: 0, b: 57 },     // Crimson
            { r: 144, g: 12, b: 63 },    // Maroon
            { r: 88, g: 24, b: 69 },     // Dark Plum
            { r: 0, g: 120, b: 215 },    // Azure Blue
            { r: 0, g: 212, b: 255 },    // Sky Cyan
            { r: 255, g: 0, b: 110 },    // Hot Pink
            { r: 131, g: 56, b: 236 },   // Royal Purple
            { r: 58, g: 134, b: 255 },   // Electric Blue
            { r: 38, g: 70, b: 83 },     // Slate Teal
            { r: 42, g: 157, b: 143 },   // Ocean Green
            { r: 233, g: 196, b: 106 },  // Sand Gold
            { r: 244, g: 162, b: 97 },   // Peach
            { r: 231, g: 111, b: 81 },    // Burnt Sienna
        ];

        for (let i = 0; i < 16; i++) {
            palette.push({ colorId: 10 + i, ...fgColors[i], a: 255 });
        }

        // 16 Background Colors (30-45)
        const bgColors = [
            { r: 20, g: 45, b: 90 },    // Deep Royal
            { r: 45, g: 65, b: 35 },    // Forest Moss
            { r: 85, g: 45, b: 45 },    // Slate Red
            { r: 15, g: 65, b: 75 },    // Ocean Deep
            { r: 65, g: 35, b: 75 },    // Deep Plum
            { r: 95, g: 55, b: 45 },    // Terracotta
            { r: 25, g: 75, b: 75 },    // Teal Shadow
            { r: 15, g: 25, b: 55 },    // Midnight Blue
            { r: 55, g: 75, b: 55 },    // Dark Sage
            { r: 75, g: 25, b: 45 },    // Burnt Grape
            { r: 65, g: 85, b: 105 },   // Stormy Blue
            { r: 55, g: 35, b: 25 },    // Chocolate Noir
            { r: 15, g: 55, b: 35 },    // Emerald Dark
            { r: 45, g: 35, b: 95 },    // Indigo Dusk
            { r: 75, g: 75, b: 85 },    // Steel Gray
            { r: 65, g: 55, b: 45 },    // Warm Shadow
        ];

        for (let i = 0; i < 16; i++) {
            palette.push({ colorId: 30 + i, ...bgColors[i], a: 255 });
        }

        engine.loadPaletteToSlot(0, palette);
        runtime.setTickRate(30);
    }

    async initUser(_runtime: IRuntime, _engine: Engine, user: User<PlayerData>) {
        const display = new Display(0, 120, 67);
        user.addDisplay(display);
        display.switchPalette(0);

        const layer = new Layer(new Vector2(0, 0), 0, 120, 67);
        user.addLayer(layer);

        user.data = {
            layer,
            mode: 'sub',
            compression: {
                chars: FrameCompression.Auto,
                fg: FrameCompression.Auto,
                bg: FrameCompression.Auto
            }
        };

        // Input Bindings
        const registry = user.getInputBindingRegistry();
        registry.defineButton(0, 'toggleAll', [{ sourceId: 0, type: InputDeviceType.Keyboard, key: KeyboardInput.Space }]);
        registry.defineButton(1, 'toggleMode', [{ sourceId: 1, type: InputDeviceType.Keyboard, key: KeyboardInput.KeyM }]);
    }

    update() { }

    updateUser(_runtime: IRuntime, _engine: Engine, user: User<PlayerData>) {
        const d = user.data;

        // ─── 1. Handle Input ──────────────────────────────────────────────────

        // Toggle all compression options between Auto and No
        if (user.isJustPressed('toggleAll')) {
            const next = d.compression.chars === FrameCompression.Auto ? FrameCompression.No : FrameCompression.Auto;
            d.compression.chars = next;
            d.compression.fg = next;
            d.compression.bg = next;
        }

        // Toggle between SubFrameMulti and FullFrameMulti
        if (user.isJustPressed('toggleMode')) {
            d.mode = d.mode === 'sub' ? 'full' : 'sub';
        }

        // ─── 2. Generate Frame Content ────────────────────────────────────────

        const WIDTH = 120;
        const HEIGHT = 67;
        const dots = new Array(WIDTH * HEIGHT);

        const HEX_CHARS = "0123456789ABCDEF";
        const FG_BLOCK_SIZE = 8;
        const BG_BAND_HEIGHT = 8;

        // Central agglomerated region bounds
        const AGGLOM_X = 20;
        const AGGLOM_Y = 10;
        const AGGLOM_W = 80;
        const AGGLOM_H = 47;

        for (let y = 0; y < HEIGHT; y++) {
            const blockY = Math.floor(y / FG_BLOCK_SIZE);
            const bandIndex = Math.floor(y / BG_BAND_HEIGHT) % 16;
            const bg = 30 + bandIndex; // Wide horizontal BG bands

            for (let x = 0; x < WIDTH; x++) {
                const blockX = Math.floor(x / FG_BLOCK_SIZE);
                const isInside = x >= AGGLOM_X && x < AGGLOM_X + AGGLOM_W &&
                    y >= AGGLOM_Y && y < AGGLOM_Y + AGGLOM_H;

                if (isInside) {
                    // High-density data for compression testing
                    const char = HEX_CHARS[Math.floor(Math.random() * HEX_CHARS.length)];
                    const fg = 10 + ((blockX + blockY * 5) % 16);
                    dots[y * WIDTH + x] = { char, fg, bg };
                } else {
                    // Visual mode differentiation
                    const char = d.mode === 'sub' ? "." : " ";
                    dots[y * WIDTH + x] = { char, fg: 1, bg };
                }
            }
        }

        // ─── 3. Dynamic Rendering ─────────────────────────────────────────────

        const frameOrder = d.mode === 'sub'
            ? OrderBuilder.subFrameMulti(0, 0, WIDTH, HEIGHT, dots, {
                compression: {
                    chars: d.compression.chars,
                    fg: d.compression.fg,
                    bg: d.compression.bg,
                }
            })
            : OrderBuilder.fullFrameMulti(dots, {
                compression: {
                    chars: d.compression.chars,
                    fg: d.compression.fg,
                    bg: d.compression.bg,
                }
            });

        // ─── 4. UI Layout ─────────────────────────────────────────────────────

        d.layer.setOrders([
            frameOrder,

            // Quick Mode Indicator (Top-Left)
            OrderBuilder.text(0, 0, d.mode === 'sub' ? "S" : "F", d.mode === 'sub' ? 5 : 49, 0),

            // Performance Dashboard
            OrderBuilder.rect(77, 2, 42, 12, 0, 0, 230, true),
            OrderBuilder.text(79, 4, "FRAME COMPRESSION TEST", 1, 0),
            OrderBuilder.text(79, 5, "----------------------", 1, 0),

            OrderBuilder.text(79, 7, `[SPACE] COMPRESS: ${d.compression.chars === FrameCompression.Auto ? "ENABLED " : "DISABLED"}`, d.compression.chars === FrameCompression.Auto ? 5 : 6, 0),
            OrderBuilder.text(79, 8, `[M] MODE: ${d.mode.toUpperCase()}FRAME`, 5, 0),

            OrderBuilder.text(79, 10, "You trade CPU time for bandwidth", 1, 0),
            OrderBuilder.text(79, 11, "Check the stats ->", 1, 0),
        ]);
    }

    async destroyUser() { }
}
