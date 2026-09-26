import { LEVELS, type NavGrid } from './navGrid';

/** Highest step up and drop down between two consecutive points (NAV-001). */
export const MAX_STEP_UP = 1;
export const MAX_DROP = 3;
/** Swim only when the dry way is longer than this many times the way through water (F05 Q3). */
export const DRY_DETOUR_FACTOR = 2;

export interface PathPoint {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  /** Swimming to reach this point. */
  readonly wet: boolean;
}

export type PathResult =
  | { readonly ok: true; readonly points: readonly PathPoint[]; readonly length: number }
  | { readonly ok: false; readonly reason: string };

/**
 * A set of columns to reach, such as the shore of a pond or an area (MAP-003, plan F06 P10):
 * the search stops at the first place to stand next to one of them.
 */
export interface Region {
  /** Rectangle around the columns: min inclusive, max exclusive. */
  readonly bounds: { minX: number; minZ: number; maxX: number; maxZ: number };
  has(x: number, z: number): boolean;
  /**
   * `touch`: a place to stand next to a column is enough (the door of a house, a shore);
   * `within`: the place must be inside, on columns of the region only (an area).
   */
  readonly reach: 'touch' | 'within';
}

const DIRECTIONS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
] as const;

/** Binary min-heap of node indices by score, reused across searches. */
class Heap {
  private nodes = new Int32Array(1024);
  private scores = new Float64Array(1024);
  size = 0;

  clear(): void {
    this.size = 0;
  }

  push(node: number, score: number): void {
    if (this.size === this.nodes.length) {
      const nodes = new Int32Array(this.size * 2);
      nodes.set(this.nodes);
      this.nodes = nodes;
      const scores = new Float64Array(this.size * 2);
      scores.set(this.scores);
      this.scores = scores;
    }
    let i = this.size++;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.scores[parent]! <= score) break;
      this.nodes[i] = this.nodes[parent]!;
      this.scores[i] = this.scores[parent]!;
      i = parent;
    }
    this.nodes[i] = node;
    this.scores[i] = score;
  }

  pop(): number {
    const top = this.nodes[0]!;
    const lastNode = this.nodes[--this.size]!;
    const lastScore = this.scores[this.size]!;
    let i = 0;
    for (;;) {
      let child = 2 * i + 1;
      if (child >= this.size) break;
      if (child + 1 < this.size && this.scores[child + 1]! < this.scores[child]!) child++;
      if (this.scores[child]! >= lastScore) break;
      this.nodes[i] = this.nodes[child]!;
      this.scores[i] = this.scores[child]!;
      i = child;
    }
    this.nodes[i] = lastNode;
    this.scores[i] = lastScore;
    return top;
  }
}

/**
 * Path search on a NavGrid (NAV-001): A* over corner levels in 8 directions, steps up of at
 * most 1 block and drops of at most 3. Water is used only when the dry way does not exist or
 * is more than twice as long (F05 Q3): two searches, dry first.
 */
export class Pathfinder {
  private readonly cost: Float64Array;
  private readonly came: Int32Array;
  private readonly stamp: Uint32Array;
  private generation = 0;
  private readonly heap = new Heap();

  constructor(readonly grid: NavGrid) {
    const nodes = grid.level.length;
    this.cost = new Float64Array(nodes);
    this.came = new Int32Array(nodes);
    this.stamp = new Uint32Array(nodes);
  }

  /** Path from a position (a character's feet) to the column (x, z). */
  find(from: { x: number; y: number; z: number }, to: { x: number; z: number }): PathResult {
    const { world } = this.grid;
    if (to.x < 0 || to.z < 0 || to.x >= world.size.x || to.z >= world.size.z) {
      return { ok: false, reason: 'the destination is outside the world' };
    }
    const start = this.nearestNode(from.x, from.y, from.z);
    if (start < 0)
      return { ok: false, reason: 'the character is not standing on a walkable place' };
    const goals = this.goalNodes(to.x, to.z);
    if (goals.size === 0)
      return { ok: false, reason: 'there is no place to stand at the destination' };
    const goal = this.grid.point(goals.values().next().value!);
    const h = (n: number) => {
      const p = this.grid.point(n);
      return octile(Math.abs(p.x - goal.x), Math.abs(p.z - goal.z));
    };
    // A destination in the water cannot be reached dry.
    const allWet = [...goals].every((g) => this.grid.wet[g] === 1);
    return this.shortest(start, (n) => goals.has(n), h, allWet);
  }

  /**
   * Path from a position to the nearest place of a region along the way (MAP-003.b–c, plan
   * F06 P10): a place to stand touching one of its columns, or standing on its columns only.
   */
  findRegion(from: { x: number; y: number; z: number }, region: Region): PathResult {
    const start = this.nearestNode(from.x, from.y, from.z);
    if (start < 0)
      return { ok: false, reason: 'the character is not standing on a walkable place' };
    const { grid } = this;
    const isGoal = (n: number) => {
      // Corner (cx, cz) is where columns cx..cx+1 and cz..cz+1 meet.
      const corner = Math.floor(n / LEVELS);
      const cx = corner % grid.cornersX;
      const cz = (corner - cx) / grid.cornersX;
      const covered = [
        region.has(cx, cz),
        region.has(cx + 1, cz),
        region.has(cx, cz + 1),
        region.has(cx + 1, cz + 1),
      ];
      return region.reach === 'touch' ? covered.some(Boolean) : covered.every(Boolean);
    };
    // Distance to the rectangle of the corners that touch the region: never an overestimate.
    const { minX, minZ, maxX, maxZ } = region.bounds;
    const h = (n: number) => {
      const p = grid.point(n);
      const dx = Math.max(minX - p.x, 0, p.x - maxX);
      const dz = Math.max(minZ - p.z, 0, p.z - maxZ);
      return octile(dx, dz);
    };
    return this.shortest(start, isGoal, h, false);
  }

  /** The shortest way, water allowed; then a dry way, searched only up to twice its length. */
  private shortest(
    start: number,
    isGoal: (node: number) => boolean,
    h: (node: number) => number,
    allGoalsWet: boolean,
  ): PathResult {
    const any = this.search(start, isGoal, h, true, Infinity);
    if (!any) return { ok: false, reason: 'there is no path to the destination' };
    if (!any.points.some((p) => p.wet) || allGoalsWet) return { ok: true, ...any };
    const dry = this.search(start, isGoal, h, false, DRY_DETOUR_FACTOR * any.length);
    return { ok: true, ...(dry ?? any) };
  }

  /** The node closest to a position: its nearest corner, at the closest level. */
  nearestNode(x: number, y: number, z: number): number {
    const { grid } = this;
    let best = -1;
    let distance = Infinity;
    const cx0 = Math.round(x) - 1;
    const cz0 = Math.round(z) - 1;
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        const cx = cx0 + dx;
        const cz = cz0 + dz;
        if (cx < 0 || cz < 0 || cx >= grid.cornersX || cz >= grid.cornersZ) continue;
        const slot = grid.nearestSlot(cx, cz, y);
        if (slot < 0) continue;
        const p = grid.point(grid.node(cx, cz, slot));
        const d = Math.hypot(p.x - x, p.z - z) + Math.abs(p.y - y) * 0.5;
        if (d < distance) {
          distance = d;
          best = grid.node(cx, cz, slot);
        }
      }
    }
    return best;
  }

  private goalNodes(x: number, z: number): Set<number> {
    const { grid } = this;
    const goals = new Set<number>();
    const cx0 = Math.round(x) - 1;
    const cz0 = Math.round(z) - 1;
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        const cx = cx0 + dx;
        const cz = cz0 + dz;
        if (cx < 0 || cz < 0 || cx >= grid.cornersX || cz >= grid.cornersZ) continue;
        for (let s = 0; s < LEVELS; s++) {
          const n = grid.node(cx, cz, s);
          if (grid.level[n]! >= 0) goals.add(n);
        }
      }
    }
    return goals;
  }

  /** A* from `start` to any goal node; paths costing more than `limit` are not explored. */
  private search(
    start: number,
    isGoal: (node: number) => boolean,
    h: (node: number) => number,
    allowWater: boolean,
    limit: number,
  ): { points: PathPoint[]; length: number } | undefined {
    const { grid, cost, came, stamp, heap } = this;
    if (!allowWater && grid.wet[start] === 1) allowWater = true;
    const gen = ++this.generation;
    heap.clear();
    stamp[start] = gen;
    cost[start] = 0;
    came[start] = -1;
    heap.push(start, h(start));
    while (heap.size > 0) {
      const node = heap.pop();
      if (isGoal(node)) return this.reconstruct(node);
      const corner = Math.floor(node / LEVELS);
      const cx = corner % grid.cornersX;
      const cz = (corner - cx) / grid.cornersX;
      const level = grid.level[node]!;
      const base = cost[node]!;
      for (const [dx, dz] of DIRECTIONS) {
        const nx = cx + dx;
        const nz = cz + dz;
        if (nx < 0 || nz < 0 || nx >= grid.cornersX || nz >= grid.cornersZ) continue;
        // Diagonals only when both sides are passable, so that corners are not cut.
        if (
          dx !== 0 &&
          dz !== 0 &&
          (!this.reachable(cx + dx, cz, level) || !this.reachable(cx, cz + dz, level))
        ) {
          continue;
        }
        for (let s = 0; s < LEVELS; s++) {
          const next = grid.node(nx, nz, s);
          const l = grid.level[next]!;
          if (l < 0 || l - level > MAX_STEP_UP || level - l > MAX_DROP) continue;
          if (!allowWater && grid.wet[next] === 1) continue;
          const step = dx !== 0 && dz !== 0 ? Math.SQRT2 : 1;
          const total = base + step;
          // The heuristic never overestimates: beyond the limit, no path through here is short enough.
          if (total + h(next) > limit) continue;
          if (stamp[next] === gen && cost[next]! <= total) continue;
          stamp[next] = gen;
          cost[next] = total;
          came[next] = node;
          heap.push(next, total + h(next));
        }
      }
    }
    return undefined;
  }

  /** Whether corner (cx, cz) has a level reachable from `level` within the step limits. */
  private reachable(cx: number, cz: number, level: number): boolean {
    const { grid } = this;
    for (let s = 0; s < LEVELS; s++) {
      const l = grid.level[grid.node(cx, cz, s)]!;
      if (l >= 0 && l - level <= MAX_STEP_UP && level - l <= MAX_DROP) return true;
    }
    return false;
  }

  private reconstruct(end: number): { points: PathPoint[]; length: number } {
    const points: PathPoint[] = [];
    for (let n = end; n >= 0; n = this.came[n]!) {
      points.push({ ...this.grid.point(n), wet: this.grid.wet[n] === 1 });
    }
    points.reverse();
    return { points, length: this.cost[end]! };
  }
}

/** Octile distance: 8 directions, diagonals cost √2. */
function octile(dx: number, dz: number): number {
  return Math.max(dx, dz) + (Math.SQRT2 - 1) * Math.min(dx, dz);
}
