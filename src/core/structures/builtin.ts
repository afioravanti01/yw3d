import { StructureRegistry } from './registry';
import { TREES } from './trees';

/** Registers the structure types of F02. */
export function registerBuiltinStructures(registry: StructureRegistry): void {
  for (const type of TREES) registry.register(type);
}

/** A registry with the built-in structures already registered. */
export function createDefaultStructures(): StructureRegistry {
  const registry = new StructureRegistry();
  registerBuiltinStructures(registry);
  return registry;
}
