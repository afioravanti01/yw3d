import type { AgentDecl } from '../../../core/yaml/worldFile';
import { BrainError } from '../brain';
import { keyVariable } from '../config';

/** Helpers of the API brains (plan F08 P13): the key, a JSON request, errors without the key. */

/** The key of an api agent, read from the environment at each request (AGENT-001.c). */
export function apiKey(agent: AgentDecl, env: NodeJS.ProcessEnv): string {
  const key = env[keyVariable(agent)];
  if (!key) throw new BrainError(`the key is missing: set ${keyVariable(agent)}`);
  return key;
}

/** Posts JSON and returns the JSON answer; an error never shows the key. */
export async function postJson(
  label: string,
  url: string,
  headers: Record<string, string>,
  body: unknown,
  key: string,
  signal: AbortSignal,
): Promise<unknown> {
  const clean = (text: string) => text.split(key).join('***').slice(0, 200);
  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify(body),
      signal,
    });
  } catch (error) {
    if (signal.aborted) throw new BrainError(`${label} was stopped`);
    throw new BrainError(
      `${label}: cannot reach ${new URL(url).host}: ${clean(String((error as Error).message))}`,
    );
  }
  const text = await response.text();
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    json = undefined;
  }
  if (!response.ok) {
    const message = (json as { error?: { message?: string } } | undefined)?.error?.message ?? text;
    throw new BrainError(`${label}: HTTP ${response.status}: ${clean(message)}`);
  }
  if (json === undefined) throw new BrainError(`${label} did not answer in JSON`);
  return json;
}
