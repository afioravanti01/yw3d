import type { Issue } from '../schema/schema';
import { didYouMean } from '../schema/schema';
import {
  rectsOverlap,
  rotateRect,
  translateRect,
  type Rect,
  type Rotation,
} from '../structures/builder';
import {
  parseParams,
  structureSeed,
  type StructureRegistry,
  type StructureType,
} from '../structures/registry';
import type { WorldSize } from '../world/world';
import type { StructureDecl } from '../yaml/worldFile';

/** A structure ready to be built: validated, with its seed and world footprint. */
export interface Placement {
  /** Where it was declared, e.g. `structures[3]`, for diagnostics. */
  readonly path: readonly (string | number)[];
  readonly type: StructureType;
  readonly params: unknown;
  readonly x: number;
  readonly z: number;
  /** Explicit height of the local origin, or undefined to rest on the surface. */
  readonly y: number | undefined;
  readonly rotation: Rotation;
  readonly seed: number;
  /** Footprint in world columns, after rotation. */
  readonly rect: Rect;
}

export function footprintOf(
  type: StructureType,
  params: unknown,
  x: number,
  z: number,
  rotation: Rotation,
): Rect {
  return translateRect(rotateRect(type.footprint(params), rotation), x, z);
}

export const rectInside = (rect: Rect, size: WorldSize): boolean =>
  rect.minX >= 0 && rect.minZ >= 0 && rect.maxX <= size.x && rect.maxZ <= size.z;

/**
 * Validates the structures declared one by one (YAML-004): known type, valid params, footprint
 * inside the world (STRUCT-004.b). Invalid declarations produce issues and no placement.
 */
export function placeStructures(
  decls: readonly StructureDecl[],
  registry: StructureRegistry,
  worldSeed: number,
  size: WorldSize,
  issues: Issue[],
): Placement[] {
  const placements: Placement[] = [];
  decls.forEach((decl, i) => {
    const path = ['structures', i];
    const type = registry.get(decl.type);
    if (!type) {
      const names = registry.names();
      issues.push({
        path: [...path, 'type'],
        message: `unknown structure type "${decl.type}"${didYouMean(decl.type, names)}; available: ${names.join(', ')}`,
      });
      return;
    }
    const params = parseParams(type, decl.params, [...path, 'params'], issues);
    if (params === undefined) return;
    const [x, z] = decl.at;
    const rotation = decl.rotation as Rotation;
    const rect = footprintOf(type, params, x, z, rotation);
    if (!rectInside(rect, size) || (decl.y !== undefined && (decl.y < 0 || decl.y >= size.y))) {
      issues.push({
        path: [...path, 'at'],
        message: `the structure is outside the world: it covers x ${rect.minX}..${rect.maxX - 1}, z ${rect.minZ}..${rect.maxZ - 1}; the world is ${size.x} × ${size.y} × ${size.z}`,
      });
      return;
    }
    placements.push({
      path,
      type,
      params,
      x,
      z,
      y: decl.y,
      rotation,
      seed: decl.seed ?? structureSeed(worldSeed, x, z, type.name),
      rect,
    });
  });
  return placements;
}

/** Pairs of placements whose footprints overlap (STRUCT-004.a), in declaration order. */
export function findConflicts(placements: readonly Placement[]): [Placement, Placement][] {
  const conflicts: [Placement, Placement][] = [];
  for (let i = 0; i < placements.length; i++) {
    for (let j = i + 1; j < placements.length; j++) {
      if (rectsOverlap(placements[i]!.rect, placements[j]!.rect)) {
        conflicts.push([placements[i]!, placements[j]!]);
      }
    }
  }
  return conflicts;
}
