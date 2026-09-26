// Controller of Pino, a test character: walks back and forth, talks, greets on E.
// yw3d protocol: JSON lines on stdin (from the host) and stdout (to the host).
import { createInterface } from 'node:readline';

const send = (message) => process.stdout.write(`${JSON.stringify(message)}\n`);
const stops = [
  { x: 56, z: 60 },
  { x: 90, z: 70 },
];
let next = 0;
let counter = 0;
const id = (kind) => `${kind}-${++counter}`;

function walkOn() {
  const stop = stops[next];
  next = (next + 1) % stops.length;
  send({ type: 'walk_to', id: id('walk'), x: stop.x, z: stop.z });
}

createInterface({ input: process.stdin }).on('line', (line) => {
  const message = JSON.parse(line);
  switch (message.type) {
    case 'hello':
      console.error(`Pino is ready (protocol ${message.version})`);
      walkOn();
      break;
    case 'action_done':
      if (message.id.startsWith('walk'))
        send({ type: 'say', id: id('say'), text: 'Che bella giornata!' });
      else if (message.id.startsWith('say')) walkOn();
      break;
    case 'action_failed':
      console.error(`action ${message.id} failed: ${message.reason}`);
      walkOn();
      break;
    case 'interacted':
      send({ type: 'look_at', id: id('look'), target: 'player' });
      send({ type: 'say', id: id('say'), text: 'Ciao! Io sono Pino.' });
      break;
    case 'heard':
      console.error(`Pino heard ${message.from}: ${message.text}`);
      break;
  }
});
