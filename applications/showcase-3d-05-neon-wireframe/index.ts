/**
 * Name: terminal-wgpu
 * Category: example
 * Description: A synthwave-themed wireframe terrain renderer with infinite
 *   scrolling. A neon road stretches toward the horizon flanked by procedural
 *   mountains, rendered as filled + wireframe quads over a starfield and sun.
 *
 * What it demonstrates (engine perspective):
 *   Primitiv can drive a full custom 3D rasteriser by treating each cell as a
 *   pixel. The entire 240×134 frame is assembled in a flat buffer every tick
 *   and flushed as a single `subFrameMulti` order with automatic compression.
 *   CRT post-processing (curvature, vignette, chromatic aberration) and
 *   emissive palette colors add a retro aesthetic with zero application-side
 *   shader code.
 *
 * How it works (algorithm):
 *   1. A pixel buffer (`dots[]`) is cleared to the dark-blue background.
 *   2. 150 pseudo-random stars are scattered on the upper half; a subset
 *      blinks based on the camera position to simulate twinkling.
 *   3. A sun disc is drawn at the horizon using circular slices with a
 *      scanline skip (every other row) for a retro CRT look.
 *   4. Terrain (road + mountains) is rasterised front-to-back using a
 *      per-column horizon buffer. Each quad is clipped against the near
 *      plane (Sutherland–Hodgman), backface-culled in screen space, then
 *      scan-converted column-by-column: only pixels above the current
 *      horizon are filled, and the horizon is raised afterward.
 *   5. The road is a flat strip (y = 0) divided into z-step quads, filled
 *      first, then overlaid with a magenta wireframe grid.
 *   6. Mountains use 10 lateral x-steps per side, with height produced by
 *      a two-octave sin/cos noise function. A phase offset (73.7) on the
 *      right side breaks symmetry. A two-pass approach fills faces first,
 *      then draws wireframe edges only where the adjacent face was visible.
 *   7. Wireframe lines use Bresenham's algorithm; ASCII density characters
 *      (`#`, `+`, `:`, `.`) are selected by distance for depth fog.
 *   8. The completed buffer is sent as `subFrameMulti` with auto
 *      compression, followed by text-order UI overlays.
 *
 * Primitiv patterns used:
 *   - `subFrameMulti(0, 0, W, H, dots)` – full-frame pixel buffer sent each
 *     tick with `FrameCompression.Auto` on chars, fg, and bg channels.
 *   - `mustBeReliable: false` on the game layer – every tick produces a
 *     complete frame so dropped frames are invisible.
 *   - Emissive palette colors (`e` field) for neon glow on wireframe lines,
 *     combined with non-emissive colors for readable HUD text.
 *   - `ScalingMode.None` with a fixed 240×134 display.
 *   - CRT effects: curvature, vignette, chromatic aberration.
 */
import {
  Engine,
  User,
  Layer,
  Display,
  OrderBuilder,
  Vector2,
  ScalingMode,
  FrameCompression,
  type IApplication,
  type IRuntime,
} from "@primitiv/engine";

// ── Types ───────────────────────────────────────────────────────────────────

interface Vector3 {
  x: number;
  y: number;
  z: number;
}

interface TerminalWgpuUserData {
  layer: Layer;
  cameraZ: number;
  speed: number;
}

// ── Constants ───────────────────────────────────────────────────────────────

const WIDTH = 240;
const HEIGHT = 134;

const ROAD_WIDTH = 14;
const ROAD_Z_STEP = 20;
const ROAD_DRAW_DEPTH = 1000;

const MOUNT_Z_STEP = 40;
const MOUNT_DRAW_DEPTH = 1000;
const MOUNT_X_STEPS = [14, 30, 50, 80, 120, 160, 200, 240, 280, 320];
const MOUNT_SIDE_OFFSET = 73.7;

const STAR_COUNT = 150;
const SUN_RADIUS = 26;

const FOV_SCALE = Math.min(WIDTH, HEIGHT * 2) * 0.7;
const CAMERA_X = 0;
const CAMERA_Y = 8;

const NEAR_CLIP = 1;
const BRESENHAM_MAX_ITER = 3000;

// Palette color IDs
const COL_BG = 0;
const COL_STAR = 1;
const COL_WIREFRAME = 2;
const COL_SUN = 3;
const COL_FILL = 5;
const COL_UI_TEXT = 6;
const COL_UI_SECONDARY = 7;
const COL_UI_PANEL = 8;

// ── Application ─────────────────────────────────────────────────────────────

export class TerminalWgpuShowcase
  implements IApplication<Engine, User<TerminalWgpuUserData>> {
  async init(_runtime: IRuntime, engine: Engine): Promise<void> {
    engine.loadPaletteToSlot(0, [
      { colorId: 0, r: 5, g: 5, b: 20, a: 255 },                  // Deep dark blue background
      { colorId: 1, r: 0, g: 255, b: 255, a: 255, e: 1.5 },       // Neon cyan (stars)
      { colorId: 2, r: 255, g: 0, b: 255, a: 255, e: 0.25 },      // Neon magenta (wireframe)
      { colorId: 3, r: 255, g: 255, b: 0, a: 255, e: 0.3 },       // Neon yellow (sun)
      { colorId: 4, r: 0, g: 0, b: 0, a: 255 },                   // True black
      { colorId: 5, r: 30, g: 10, b: 40, a: 255, e: 0.05 },       // Dark purple (terrain fill)
      { colorId: 6, r: 240, g: 240, b: 240, a: 255 },             // UI primary text
      { colorId: 7, r: 150, g: 210, b: 220, a: 255 },             // UI secondary text
      { colorId: 8, r: 12, g: 16, b: 24, a: 255 },                // UI panel background
    ]);
    _runtime.setTickRate(60);
  }

  initUser(
    _runtime: IRuntime,
    _engine: Engine,
    user: User<TerminalWgpuUserData>,
  ): void {
    const display = new Display(0, WIDTH, HEIGHT);
    display.setScalingMode(ScalingMode.None);
    display.setCurvature({ enabled: true, amount: 0.25 });
    display.setVignette({ enabled: true, strength: 0.5, radius: 0.2 });
    display.setChromaticAberration({ enabled: true, strength: 0.25 });
    display.setEdgeGlow({ enabled: true, strength: 0.4, size: 2, blur: 20 });

    user.addDisplay(display);
    display.switchPalette(0);

    const layer = new Layer(new Vector2(0, 0), 0, WIDTH, HEIGHT, {
      mustBeReliable: false,
    });
    user.data.layer = layer;
    user.addLayer(layer);

    user.data.cameraZ = 0;
    user.data.speed = 2.0;
  }

  update(): void { }

  updateUser(
    _runtime: IRuntime,
    _engine: Engine,
    user: User<TerminalWgpuUserData>,
  ): void {
    const data = user.data;
    data.cameraZ += data.speed;

    const cameraZ = data.cameraZ;
    const orders: any[] = [];

    // ── Pixel buffer ──────────────────────────────────────────────────────

    const dots = new Array(WIDTH * HEIGHT);
    dots.fill({ charCode: " ", fgColorCode: COL_BG, bgColorCode: COL_BG });

    // ── Starfield ─────────────────────────────────────────────────────────
    // Pseudo-random star positions with a twinkling subset based on camera Z.

    for (let i = 0; i < STAR_COUNT; i++) {
      const sx =
        Math.abs(Math.floor(Math.sin(i * 12.9898 + 78.233) * 43758.5453)) %
        WIDTH;
      const sy =
        Math.abs(Math.floor(Math.cos(i * 4.1414 + 1.234) * 54321.1234)) %
        Math.floor(HEIGHT / 2 - 5);
      if ((Math.floor(cameraZ * 0.1) + i) % 10 > 3) {
        dots[sy * WIDTH + sx] = {
          charCode: ".",
          fgColorCode: COL_STAR,
          bgColorCode: COL_BG,
        };
      }
    }

    // ── Horizon sun ───────────────────────────────────────────────────────
    // Circular slices with scanline skip (odd rows only) for a retro feel.

    const horizonY = Math.floor(HEIGHT / 2) - 1;

    for (let sy = 0; sy < SUN_RADIUS; sy++) {
      if (sy % 2 !== 0) {
        const sliceWidth = Math.sqrt(SUN_RADIUS * SUN_RADIUS - sy * sy) * 2.2;
        const startX = Math.round(WIDTH / 2 - sliceWidth);
        const endX = Math.round(WIDTH / 2 + sliceWidth);
        const yPos = Math.round(horizonY - sy);

        if (yPos <= horizonY) {
          for (let px = startX; px <= endX; px++) {
            if (px >= 0 && px < WIDTH && yPos >= 0) {
              dots[yPos * WIDTH + px] = {
                charCode: " ",
                fgColorCode: COL_BG,
                bgColorCode: COL_SUN,
              };
            }
          }
        }
      }
    }

    // ── Rendering helpers ─────────────────────────────────────────────────

    /** Bresenham's line algorithm rasterised into the pixel buffer. */
    function drawLine(
      x0: number,
      y0: number,
      x1: number,
      y1: number,
      char: string,
      fg: number,
    ): void {
      if (isNaN(x0) || isNaN(y0) || isNaN(x1) || isNaN(y1)) return;
      x0 = Math.round(x0);
      y0 = Math.round(y0);
      x1 = Math.round(x1);
      y1 = Math.round(y1);

      const dx = Math.abs(x1 - x0);
      const dy = Math.abs(y1 - y0);
      const sx = x0 < x1 ? 1 : -1;
      const sy = y0 < y1 ? 1 : -1;
      let err = dx - dy;

      let iter = 0;
      while (iter++ < BRESENHAM_MAX_ITER) {
        if (x0 >= 0 && x0 < WIDTH && y0 >= 0 && y0 < HEIGHT) {
          dots[y0 * WIDTH + x0] = {
            charCode: char,
            fgColorCode: fg,
            bgColorCode: COL_BG,
          };
        }
        if (x0 === x1 && y0 === y1) break;
        const e2 = 2 * err;
        if (e2 > -dy) {
          err -= dy;
          x0 += sx;
        }
        if (e2 < dx) {
          err += dx;
          y0 += sy;
        }
      }
    }

    /** Perspective projection from world space to screen space. */
    function project(x: number, y: number, z: number): Vector2 | null {
      const relZ = z - cameraZ;
      if (relZ < NEAR_CLIP) return null;
      const px = ((x - CAMERA_X) / relZ) * FOV_SCALE + WIDTH / 2;
      const py = -((y - CAMERA_Y) / relZ) * (FOV_SCALE * 0.5) + HEIGHT / 2;
      return new Vector2(px, py);
    }

    /**
     * Draw a 3D line with near-plane clipping and depth-fog character
     * density (`#` → `+` → `:` → `.` as distance increases).
     */
    function drawLine3D(p1: Vector3, p2: Vector3, fg: number): void {
      if (p1.z - cameraZ < NEAR_CLIP && p2.z - cameraZ < NEAR_CLIP) return;

      let v1 = { ...p1 };
      let v2 = { ...p2 };

      // Clip against near plane
      if (v1.z - cameraZ < NEAR_CLIP) {
        const t = (NEAR_CLIP - (v1.z - cameraZ)) / (v2.z - v1.z);
        v1 = {
          x: v1.x + t * (v2.x - v1.x),
          y: v1.y + t * (v2.y - v1.y),
          z: cameraZ + NEAR_CLIP,
        };
      } else if (v2.z - cameraZ < NEAR_CLIP) {
        const t = (NEAR_CLIP - (v2.z - cameraZ)) / (v1.z - v2.z);
        v2 = {
          x: v2.x + t * (v1.x - v2.x),
          y: v2.y + t * (v1.y - v2.y),
          z: cameraZ + NEAR_CLIP,
        };
      }

      // Depth-fog character selection
      const dist = (v1.z + v2.z) / 2 - cameraZ;
      let char = "#";
      if (dist > 800) char = ".";
      else if (dist > 500) char = ":";
      else if (dist > 250) char = "+";

      const proj1 = project(v1.x, v1.y, v1.z);
      const proj2 = project(v2.x, v2.y, v2.z);
      if (proj1 && proj2) {
        drawLine(proj1.x, proj1.y, proj2.x, proj2.y, char, fg);
      }
    }

    /**
     * Clip a 3D polygon against the near plane using the
     * Sutherland–Hodgman algorithm. Returns the clipped vertex list.
     */
    function clipPolyNearPlane(verts: Vector3[]): Vector3[] {
      const nearZ = cameraZ + NEAR_CLIP;
      const out: Vector3[] = [];
      for (let i = 0; i < verts.length; i++) {
        const cur = verts[i];
        const next = verts[(i + 1) % verts.length];
        const curInside = cur.z >= nearZ;
        const nextInside = next.z >= nearZ;
        if (curInside) out.push(cur);
        if (curInside !== nextInside) {
          const t = (nearZ - cur.z) / (next.z - cur.z);
          out.push({
            x: cur.x + t * (next.x - cur.x),
            y: cur.y + t * (next.y - cur.y),
            z: nearZ,
          });
        }
      }
      return out;
    }

    // ── Horizon buffer ────────────────────────────────────────────────────
    // Per-column tracker of the highest (lowest Y) pixel already drawn.
    // Terrain is rendered front-to-back; only pixels above the current
    // horizon are filled, achieving correct occlusion without sorting.

    const horizonBuf = new Int32Array(WIDTH).fill(HEIGHT);

    /**
     * Fill a terrain quad using the horizon buffer.
     *
     * The polygon is near-plane-clipped, projected, optionally backface-
     * culled (via `cullSign`), then scan-converted column by column. For
     * each screen column, the topmost projected Y is found; pixels from
     * there down to the current horizon are filled and the horizon is
     * raised.
     *
     * @param cullSign  Backface cull direction: -1 (left), 1 (right), 0 (none).
     * @returns `true` if any pixels were drawn (used to gate wireframe).
     */
    function fillTerrainQuad(
      v0: Vector3,
      v1: Vector3,
      v2: Vector3,
      v3: Vector3,
      bg: number,
      cullSign: number = 0,
    ): boolean {
      const clipped = clipPolyNearPlane([v0, v1, v2, v3]);
      if (clipped.length < 3) return false;

      const projected = clipped.map((v) => project(v.x, v.y, v.z)!);
      if (projected.some((p) => p === null)) return false;

      // Screen-space backface culling via cross product
      if (cullSign !== 0) {
        const ax = projected[1].x - projected[0].x;
        const ay = projected[1].y - projected[0].y;
        const bx = projected[2].x - projected[0].x;
        const by = projected[2].y - projected[0].y;
        const cross = ax * by - ay * bx;
        if (cross * cullSign > 0) return false;
      }

      let minX = Math.floor(Math.min(...projected.map((p) => p.x)));
      let maxX = Math.ceil(Math.max(...projected.map((p) => p.x)));
      minX = Math.max(0, minX);
      maxX = Math.min(WIDTH - 1, maxX);

      let anyDrawn = false;

      for (let x = minX; x <= maxX; x++) {
        // Find topmost polygon Y at this column by intersecting all edges
        let surfaceY = HEIGHT as number;
        for (let i = 0; i < projected.length; i++) {
          const ea = projected[i];
          const eb = projected[(i + 1) % projected.length];
          if ((ea.x <= x && eb.x >= x) || (eb.x <= x && ea.x >= x)) {
            if (Math.abs(eb.x - ea.x) > 0.001) {
              const t = (x - ea.x) / (eb.x - ea.x);
              const y = ea.y + t * (eb.y - ea.y);
              if (y < surfaceY) surfaceY = y;
            } else {
              surfaceY = Math.min(surfaceY, ea.y, eb.y);
            }
          }
        }

        const drawTop = Math.max(0, Math.floor(surfaceY));
        const drawBottom = horizonBuf[x];
        if (drawTop >= drawBottom) continue;

        anyDrawn = true;
        for (let y = drawTop; y < drawBottom; y++) {
          dots[y * WIDTH + x] = {
            charCode: " ",
            fgColorCode: COL_BG,
            bgColorCode: bg,
          };
        }
        horizonBuf[x] = drawTop;
      }

      return anyDrawn;
    }

    // ── Road ──────────────────────────────────────────────────────────────
    // Flat strip at y = 0, filled front-to-back then overlaid with wireframe.

    const roadZStart = Math.floor(cameraZ / ROAD_Z_STEP) * ROAD_Z_STEP;

    for (let z = ROAD_Z_STEP; z <= ROAD_DRAW_DEPTH; z += ROAD_Z_STEP) {
      const absZ = roadZStart + z;
      const prevAbsZ = absZ - ROAD_Z_STEP;
      fillTerrainQuad(
        { x: -ROAD_WIDTH, y: 0, z: prevAbsZ },
        { x: ROAD_WIDTH, y: 0, z: prevAbsZ },
        { x: ROAD_WIDTH, y: 0, z: absZ },
        { x: -ROAD_WIDTH, y: 0, z: absZ },
        COL_FILL,
      );
    }

    // Road edge lines
    drawLine3D(
      { x: -ROAD_WIDTH, y: 0, z: cameraZ },
      { x: -ROAD_WIDTH, y: 0, z: cameraZ + ROAD_DRAW_DEPTH },
      COL_WIREFRAME,
    );
    drawLine3D(
      { x: ROAD_WIDTH, y: 0, z: cameraZ },
      { x: ROAD_WIDTH, y: 0, z: cameraZ + ROAD_DRAW_DEPTH },
      COL_WIREFRAME,
    );

    // Lateral grid lines
    for (let z = 0; z < ROAD_DRAW_DEPTH; z += ROAD_Z_STEP) {
      const absZ = roadZStart + z;
      drawLine3D(
        { x: -ROAD_WIDTH, y: 0, z: absZ },
        { x: ROAD_WIDTH, y: 0, z: absZ },
        COL_WIREFRAME,
      );
    }

    // ── Mountains ─────────────────────────────────────────────────────────
    // Procedural terrain on both sides, connected from road edge to far
    // horizon. Two-pass: fill faces first (horizon buffer occlusion), then
    // draw wireframe only where adjacent faces were visible.

    const mountZStart = Math.floor(cameraZ / MOUNT_Z_STEP) * MOUNT_Z_STEP;

    for (const side of [-1, 1] as const) {
      /** Two-octave sin/cos height function with side-dependent phase. */
      function getMountHeight(nx: number, nz: number): number {
        if (nx <= ROAD_WIDTH) return 0;
        const depth = nx - ROAD_WIDTH;
        const amp = depth * 0.5;
        const phase = side === 1 ? MOUNT_SIDE_OFFSET : 0;
        return (
          (Math.sin(nz * 0.006 + nx * 0.015 + phase) * 0.5 + 0.5) *
          amp *
          1.5 +
          (Math.cos(nz * 0.011 - nx * 0.02 + phase * 0.7) * 0.5 + 0.5) * amp
        );
      }

      // Visibility table: visibleFace[zi][xi] = true if the face was drawn
      const visibleFace: boolean[][] = [];
      for (let zi = 0; zi <= Math.floor(MOUNT_DRAW_DEPTH / MOUNT_Z_STEP); zi++) {
        visibleFace[zi] = [];
      }

      // Pass 1 – Fill faces front-to-back
      for (let z = MOUNT_Z_STEP; z <= MOUNT_DRAW_DEPTH; z += MOUNT_Z_STEP) {
        const absZ = mountZStart + z;
        const prevAbsZ = absZ - MOUNT_Z_STEP;
        const zi = z / MOUNT_Z_STEP;

        for (let xi = 0; xi < MOUNT_X_STEPS.length - 1; xi++) {
          const nx0 = MOUNT_X_STEPS[xi];
          const nx1 = MOUNT_X_STEPS[xi + 1];

          visibleFace[zi][xi] = fillTerrainQuad(
            { x: nx0 * side, y: getMountHeight(nx0, prevAbsZ), z: prevAbsZ },
            { x: nx1 * side, y: getMountHeight(nx1, prevAbsZ), z: prevAbsZ },
            { x: nx1 * side, y: getMountHeight(nx1, absZ), z: absZ },
            { x: nx0 * side, y: getMountHeight(nx0, absZ), z: absZ },
            COL_FILL,
            side,
          );
        }
      }

      // Pass 2 – Wireframe edges adjacent to at least one visible face
      for (let z = 0; z <= MOUNT_DRAW_DEPTH; z += MOUNT_Z_STEP) {
        const absZ = mountZStart + z;
        const zi = z / MOUNT_Z_STEP;

        for (let xi = 0; xi < MOUNT_X_STEPS.length; xi++) {
          const nx = MOUNT_X_STEPS[xi];
          const x = nx * side;
          const h = getMountHeight(nx, absZ);
          const p: Vector3 = { x, y: h, z: absZ };

          // Depth edge (along Z) – shared by faces [xi-1] and [xi]
          if (z > 0) {
            const adjLeft = xi > 0 && visibleFace[zi]?.[xi - 1];
            const adjRight =
              xi < MOUNT_X_STEPS.length - 1 && visibleFace[zi]?.[xi];
            if (adjLeft || adjRight) {
              const prevAbsZ = absZ - MOUNT_Z_STEP;
              const hPrevZ = getMountHeight(nx, prevAbsZ);
              drawLine3D({ x, y: hPrevZ, z: prevAbsZ }, p, COL_WIREFRAME);
            }
          }

          // Lateral edge (along X) – shared by faces at z and z+1
          if (xi > 0) {
            const adjFront = z > 0 && visibleFace[zi]?.[xi - 1];
            const adjBack =
              z < MOUNT_DRAW_DEPTH && visibleFace[zi + 1]?.[xi - 1];
            if (adjFront || adjBack) {
              const prevNx = MOUNT_X_STEPS[xi - 1];
              const prevX = prevNx * side;
              const hPrevX = getMountHeight(prevNx, absZ);
              drawLine3D(
                { x: prevX, y: hPrevX, z: absZ },
                p,
                COL_WIREFRAME,
              );
            }
          }
        }
      }
    }

    // ── Submit frame ──────────────────────────────────────────────────────

    orders.push(
      OrderBuilder.subFrameMulti(0, 0, WIDTH, HEIGHT, dots as any, {
        compression: {
          chars: FrameCompression.Auto,
          fg: FrameCompression.Auto,
          bg: FrameCompression.Auto,
        },
      }),
    );

    // ── HUD overlay ───────────────────────────────────────────────────────

    orders.push(
      OrderBuilder.text(1, 1, `  SYNTHWAVE WIREFRAME  `, COL_UI_TEXT, COL_UI_PANEL),
    );
    orders.push(
      OrderBuilder.text(1, 3, `Speed: ${data.speed.toFixed(1)} `, COL_UI_TEXT, COL_UI_PANEL),
    );
    orders.push(
      OrderBuilder.text(1, 4, `Status: Cruising `, COL_UI_SECONDARY, COL_UI_PANEL),
    );

    data.layer.setOrders(orders);
  }

  async destroyUser(): Promise<void> { }
}
