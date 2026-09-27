/** Highest block id: block data is stored as one byte per block (plan P1). */
export const MAX_BLOCK_ID = 255;

export interface BlockDef {
  /** Stable numeric id, stored in the world data. */
  readonly id: number;
  /** Unique name, used by code and (from F02) by the world YAML. */
  readonly name: string;
  /** Base color, sRGB 0xRRGGBB. */
  readonly color: number;
  /** Maximum relative brightness deviation from the base color, in [0, 1] (RENDER-001.b). */
  readonly variation: number;
  /** Blocks movement (used by physics from F03). */
  readonly solid: boolean;
  /** Hides the faces of adjacent blocks. */
  readonly opaque: boolean;
}

/**
 * Registry of block types (WORLD-004). New types are added with `register`, from any module,
 * without changing the core (P5).
 */
export class BlockRegistry {
  /** Lookup table for hot loops: 1 if the block id is opaque. */
  readonly opaque = new Uint8Array(MAX_BLOCK_ID + 1);
  /** Lookup table for hot loops: 1 if the block id is solid. */
  readonly solid = new Uint8Array(MAX_BLOCK_ID + 1);

  private readonly byId = new Map<number, BlockDef>();
  private readonly byName = new Map<string, BlockDef>();

  register(def: BlockDef): BlockDef {
    if (!Number.isInteger(def.id) || def.id < 0 || def.id > MAX_BLOCK_ID) {
      throw new RangeError(`Block id ${def.id} is not an integer in [0, ${MAX_BLOCK_ID}]`);
    }
    if (def.name.trim() === '') {
      throw new Error(`Block ${def.id} has an empty name`);
    }
    if (!Number.isInteger(def.color) || def.color < 0 || def.color > 0xffffff) {
      throw new RangeError(`Block "${def.name}" has an invalid color ${def.color}`);
    }
    if (!(def.variation >= 0 && def.variation <= 1)) {
      throw new RangeError(`Block "${def.name}" has variation ${def.variation} outside [0, 1]`);
    }
    const sameId = this.byId.get(def.id);
    if (sameId) {
      throw new Error(`Block id ${def.id} is already used by "${sameId.name}"`);
    }
    if (this.byName.has(def.name)) {
      throw new Error(`Block name "${def.name}" is already registered`);
    }
    const frozen = Object.freeze({ ...def });
    this.byId.set(def.id, frozen);
    this.byName.set(def.name, frozen);
    this.opaque[def.id] = def.opaque ? 1 : 0;
    this.solid[def.id] = def.solid ? 1 : 0;
    return frozen;
  }

  get(id: number): BlockDef | undefined {
    return this.byId.get(id);
  }

  getByName(name: string): BlockDef | undefined {
    return this.byName.get(name);
  }

  /** Id of a registered block name; throws if the name is unknown. */
  idOf(name: string): number {
    const def = this.byName.get(name);
    if (!def) {
      throw new Error(`Unknown block "${name}"`);
    }
    return def.id;
  }

  all(): BlockDef[] {
    return [...this.byId.values()].sort((a, b) => a.id - b.id);
  }
}
