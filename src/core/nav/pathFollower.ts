import { IDLE, type EntityState, type Intent } from '../physics/entity';
import type { PathPoint, PathResult } from './pathfinding';

/** A waypoint is passed when the character is this close to it, horizontally. */
const WAYPOINT_REACHED = 0.4;
/** The action is done within this distance of the destination (NAV-002.a). */
export const ARRIVAL_DISTANCE = 1;
/** Stuck: moved less than this in STUCK_SECONDS (NAV-002.b, plan F05 P5). Detours around a
 * house may take the character farther from the destination for a while: only standing still
 * counts as stuck. */
const STUCK_PROGRESS = 0.5;
export const STUCK_SECONDS = 2;
export const MAX_REPLANS = 3;

export type FollowStatus =
  | { readonly kind: 'moving' }
  | { readonly kind: 'arrived' }
  | { readonly kind: 'failed'; readonly reason: string };

/** Finds a path from a position to a column; supplied by the caller, e.g. a Pathfinder. */
export type FindPath = (
  from: { x: number; y: number; z: number },
  to: { x: number; z: number },
) => PathResult;

/**
 * Walks a character to a destination along a path, only through intents (NAV-002.a, P3).
 * When it makes no progress for STUCK_SECONDS it searches the path again; after MAX_REPLANS
 * attempts it fails (NAV-002.b).
 */
export class PathFollower {
  status: FollowStatus = { kind: 'moving' };
  /** Times the path was searched again after getting stuck. */
  replans = 0;
  private points: readonly PathPoint[] = [];
  private index = 0;
  private checkTime: number;
  private checkPosition: { x: number; z: number };

  constructor(
    private readonly findPath: FindPath,
    readonly destination: { readonly x: number; readonly z: number },
    start: EntityState,
    time: number,
    private readonly run = false,
  ) {
    this.checkTime = time;
    this.checkPosition = { x: start.x, z: start.z };
    this.plan(start);
  }

  /** The intent for this step, given the state of the character and the simulated time. */
  update(state: EntityState, time: number): Intent {
    if (this.status.kind !== 'moving') return IDLE;
    const remaining = Math.hypot(this.destination.x - state.x, this.destination.z - state.z);
    if (remaining <= ARRIVAL_DISTANCE) {
      this.status = { kind: 'arrived' };
      return IDLE;
    }
    if (time - this.checkTime >= STUCK_SECONDS) {
      const moved = Math.hypot(state.x - this.checkPosition.x, state.z - this.checkPosition.z);
      if (moved < STUCK_PROGRESS) {
        if (this.replans >= MAX_REPLANS) {
          this.status = {
            kind: 'failed',
            reason: `stuck on the way, after ${MAX_REPLANS} new paths`,
          };
          return IDLE;
        }
        this.replans++;
        this.plan(state);
        if (this.status.kind !== 'moving') return IDLE;
      }
      this.checkTime = time;
      this.checkPosition = { x: state.x, z: state.z };
    }

    // Skip the waypoints already reached; after the last one, head for the destination.
    while (this.index < this.points.length) {
      const p = this.points[this.index]!;
      if (Math.hypot(p.x - state.x, p.z - state.z) > WAYPOINT_REACHED) break;
      this.index++;
    }
    const target = this.points[this.index] ?? { ...this.destination, y: state.y, wet: false };
    const dx = target.x - state.x;
    const dz = target.z - state.z;
    const length = Math.hypot(dx, dz) || 1;
    // In water, swim up where the way climbs out onto the bank.
    const climbing = state.submerged > 0 && (!target.wet || target.y > state.y + 0.5);
    return {
      moveX: dx / length,
      moveZ: dz / length,
      run: this.run,
      jump: false,
      swim: climbing ? 1 : 0,
    };
  }

  /** Total length of the current path, for the time limit of the action (PROTO-006.b). */
  get length(): number {
    let total = 0;
    for (let i = 1; i < this.points.length; i++) {
      const a = this.points[i - 1]!;
      const b = this.points[i]!;
      total += Math.hypot(b.x - a.x, b.z - a.z);
    }
    return total;
  }

  private plan(from: EntityState): void {
    const result = this.findPath(from, this.destination);
    if (!result.ok) {
      this.status = { kind: 'failed', reason: result.reason };
      return;
    }
    this.points = result.points;
    this.index = 0;
  }
}
