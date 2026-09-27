import type { Simulation } from './simulation';

/** State and running instruction of a character's behavior, for the overlay (DEBUG-001.a). */
export function activityOf(sim: Simulation, id: string): string | null {
  const activity = sim.behaviors.activity(id);
  if (!activity) return null;
  return `${activity.state}${activity.instruction ? ` · ${activity.instruction}` : ''}`;
}
