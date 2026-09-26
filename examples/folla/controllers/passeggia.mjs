// A wandering controller for crowds: walks to random places around the village, pauses, and
// goes on. Each character runs its own copy of this program (PERF-005.a).
import { createInterface } from 'node:readline';

const send = (message) => process.stdout.write(`${JSON.stringify(message)}\n`);
let counter = 0;
const id = (kind) => `${kind}-${++counter}`;
const between = (min, max) => min + Math.random() * (max - min);

const wander = () =>
  send({
    type: 'walk_to',
    id: id('walk'),
    x: between(110, 215),
    z: between(30, 95),
    speed: between(1, 2),
  });

createInterface({ input: process.stdin }).on('line', (line) => {
  const message = JSON.parse(line);
  if (message.type === 'hello') wander();
  if (message.type === 'action_done' && message.id.startsWith('walk')) {
    send({ type: 'wait', id: id('wait'), seconds: between(1, 4) });
  }
  if (message.type === 'action_done' && message.id.startsWith('wait')) wander();
  if (message.type === 'action_failed') wander();
});
