// 各种表面的贴图配方：拉丝金属、阳极氧化、皮革、石材、织物、穿孔板、橡胶与指纹污渍。
import type { Texture } from 'three'
import type { SurfaceRecipe, TextureForge } from './forge'

/** 每个配方都定义 surface(uv) → (高度, 粗糙度, 明暗)，0.5 为“不改变”。 */
const recipes = {
  /** 拉丝金属：沿一个方向拉长的细纹，夹杂少量较深的划痕。 */
  brushed: {
    bump: 2.2,
    body: /* glsl */ `
      vec3 surface(vec2 uv) {
        float fine = vnoise(uv, vec2(6.0, 700.0));
        float mid = vnoise(uv + 0.31, vec2(3.0, 180.0));
        float scratch = smoothstep(0.86, 1.0, vnoise(uv + 0.7, vec2(2.0, 90.0))) * 0.6;
        float height = fine * 0.55 + mid * 0.45 - scratch * 0.5;
        float cloud = fbm(uv, 4.0, 4);
        return vec3(height, 0.42 + fine * 0.16 + (cloud - 0.5) * 0.3, 0.46 + cloud * 0.1 - scratch * 0.08);
      }
    `,
  },
  /** 阳极氧化/喷涂面板：细腻的橘皮颗粒，大面积有轻微的油污与磨损变化。 */
  anodized: {
    bump: 1.1,
    body: /* glsl */ `
      vec3 surface(vec2 uv) {
        float grain = fbm(uv, 96.0, 3);
        float wear = fbm(uv + 0.5, 5.0, 5);
        float scuff = smoothstep(0.72, 0.9, fbm(uv + 0.23, 9.0, 4)) * vnoise(uv, vec2(40.0, 300.0));
        float height = grain * 0.8 + scuff * 0.2;
        return vec3(height, 0.5 + (wear - 0.5) * 0.5 + scuff * 0.25, 0.5 + (wear - 0.5) * 0.14 + scuff * 0.1);
      }
    `,
  },
  /** 皮革：细胞状的皮纹与更细的毛孔，纹沟处略粗糙、略暗。 */
  leather: {
    bump: 3.0,
    body: /* glsl */ `
      vec3 surface(vec2 uv) {
        vec3 cell = voronoi(uv, 46.0);
        vec3 pore = voronoi(uv + 0.37, 150.0);
        float crease = smoothstep(0.0, 0.16, cell.y - cell.x);
        float height = crease * 0.75 + smoothstep(0.0, 0.3, pore.y - pore.x) * 0.25;
        float blotch = fbm(uv, 4.0, 4);
        return vec3(height, 0.5 + (0.5 - crease) * 0.3 + (blotch - 0.5) * 0.3, 0.42 + crease * 0.1 + (blotch - 0.5) * 0.16);
      }
    `,
  },
  /** 抛光石材：云状的深浅变化、稀疏的浅色矿脉，抛光程度不完全均匀。 */
  stone: {
    bump: 0.35,
    body: /* glsl */ `
      vec3 surface(vec2 uv) {
        float cloud = fbm(uv, 3.0, 6);
        float warp = fbm(uv + cloud * 0.25, 5.0, 5);
        float vein = 1.0 - smoothstep(0.0, 0.035, abs(fbm(uv + warp * 0.3, 4.0, 5) - 0.5));
        float speck = smoothstep(0.82, 0.95, vnoise(uv, vec2(260.0)));
        float smear = fbm(uv + 0.71, 7.0, 4);
        return vec3(cloud * 0.6 + speck * 0.2, 0.5 + (smear - 0.5) * 0.55, 0.42 + cloud * 0.14 + vein * 0.22 + speck * 0.08);
      }
    `,
  },
  /** 织物：经纬交织的编织纹。 */
  fabric: {
    bump: 3.5,
    body: /* glsl */ `
      vec3 surface(vec2 uv) {
        vec2 weave = uv * 180.0;
        float over = step(0.5, fract(floor(weave.x) * 0.5 + floor(weave.y) * 0.5));
        vec2 thread = abs(fract(weave) - 0.5);
        float warp = cos(thread.x * 3.1416) * (0.55 + 0.45 * over);
        float weft = cos(thread.y * 3.1416) * (1.0 - 0.45 * over);
        float fuzz = vnoise(uv, vec2(420.0));
        float height = max(warp, weft) * 0.8 + fuzz * 0.2;
        return vec3(height, 0.62 + fuzz * 0.1, 0.4 + height * 0.2);
      }
    `,
  },
  /** 穿孔吸音板：规则排列的小圆孔，孔内更暗。 */
  perforated: {
    bump: 4.0,
    body: /* glsl */ `
      vec3 surface(vec2 uv) {
        vec2 grid = uv * 48.0;
        grid.x += step(1.0, mod(grid.y, 2.0)) * 0.5;
        float hole = 1.0 - smoothstep(0.2, 0.3, length(fract(grid) - 0.5));
        float grain = fbm(uv, 80.0, 3);
        return vec3(1.0 - hole + grain * 0.06, 0.6 + grain * 0.1, 0.5 - hole * 0.42 + (grain - 0.5) * 0.06);
      }
    `,
  },
  /** 橡胶/哑光塑料：非常细的颗粒。 */
  matte: {
    bump: 1.6,
    body: /* glsl */ `
      vec3 surface(vec2 uv) {
        float grain = fbm(uv, 180.0, 3);
        float cloud = fbm(uv + 0.4, 6.0, 4);
        return vec3(grain, 0.52 + (cloud - 0.5) * 0.22, 0.48 + (cloud - 0.5) * 0.08);
      }
    `,
  },
  /** 光滑表面上的指纹与擦拭痕迹：几乎没有凹凸，只改变反光的清晰度。 */
  smudge: {
    bump: 0.12,
    body: /* glsl */ `
      vec3 surface(vec2 uv) {
        float wipe = fbm(uv + fbm(uv, 3.0, 3) * 0.3, 6.0, 5);
        vec3 print = voronoi(uv, 9.0);
        float finger = (1.0 - smoothstep(0.1, 0.3, print.x)) * step(0.55, print.z) * vnoise(uv, vec2(240.0, 60.0));
        float dust = smoothstep(0.9, 1.0, vnoise(uv + 0.2, vec2(300.0)));
        return vec3(dust * 0.5, 0.36 + wipe * 0.34 + finger * 0.45, 0.5 + dust * 0.1);
      }
    `,
  },
  /** 实木地板：一条条错缝拼接的木板，板缝略凹，每块板深浅不同，顺着木板方向有细长的木纹。 */
  wood: {
    bump: 1.4,
    body: /* glsl */ `
      vec3 surface(vec2 uv) {
        float rows = 16.0;
        float row = floor(uv.y * rows);
        float along = uv.x * 3.0 + hash12(vec2(row, 3.0));
        float tone = hash12(vec2(mod(floor(along), 3.0), row));
        vec2 inside = vec2(fract(along), fract(uv.y * rows));
        float edge = min(min(inside.x, 1.0 - inside.x) * 40.0, min(inside.y, 1.0 - inside.y) * 5.0);
        float gap = 1.0 - smoothstep(0.0, 0.25, edge);
        float grain = vnoise(uv + tone, vec2(6.0, 240.0)) * 0.6 + vnoise(uv + 0.3, vec2(14.0, 600.0)) * 0.4;
        return vec3(0.7 - gap * 0.6 + grain * 0.12, 0.5 + (grain - 0.5) * 0.25 + gap * 0.3, 0.4 + tone * 0.2 + grain * 0.1 - gap * 0.25);
      }
    `,
  },
  /** 篮球皮面：密集的小颗粒凸起。 */
  pebble: {
    bump: 4.5,
    body: /* glsl */ `
      vec3 surface(vec2 uv) {
        vec3 cell = voronoi(uv, 90.0);
        float bump = 1.0 - smoothstep(0.0, 0.55, cell.x);
        float blotch = fbm(uv, 5.0, 4);
        return vec3(bump, 0.56 - bump * 0.1 + (blotch - 0.5) * 0.2, 0.42 + bump * 0.14 + (blotch - 0.5) * 0.1);
      }
    `,
  },
} satisfies Record<string, SurfaceRecipe>

export type SurfaceName = keyof typeof recipes
export type SurfaceTextures = Record<SurfaceName, Texture>

/** 一次生成全部表面贴图。 */
export function bakeSurfaces(forge: TextureForge, size: number): SurfaceTextures {
  const names = Object.keys(recipes) as SurfaceName[]
  return Object.fromEntries(names.map((name) => [name, forge.bake({ ...recipes[name], size })])) as SurfaceTextures
}
