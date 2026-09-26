// Controller of the pescatrice (fisherwoman) of the example valley, in JavaScript (Node).
//
// She stays by the pond, answers the guard, and when the player presses E near her she walks
// with them for a while. The yw3d protocol is JSON lines: host messages on stdin, requests on
// stdout, logs on stderr.
import { createInterface } from 'node:readline';

const HOME = { x: 182, z: 108 };
const send = (message) => process.stdout.write(`${JSON.stringify(message)}\n`);
const log = (text) => console.error(text);
let counter = 0;
const id = (kind) => `${kind}-${++counter}`;
let followingUntil = -1;

createInterface({ input: process.stdin }).on('line', (line) => {
  const message = JSON.parse(line);
  switch (message.type) {
    case 'hello':
      log(`pescatrice ready, protocol ${message.version}`);
      send({ type: 'look_at', id: id('look'), x: 196, z: 112 });
      break;
    case 'interacted':
      send({
        type: 'say',
        id: id('say'),
        text: 'Vuoi vedere dove abboccano i pesci? Vieni con me.',
      });
      break;
    case 'heard':
      if (message.from === 'guardiano') {
        send({ type: 'say', id: id('reply'), text: 'Tutto tranquillo, grazie guardiano!' });
      }
      break;
    case 'action_done':
      // After inviting the player, follow them for 20 seconds.
      if (message.id.startsWith('say')) {
        followingUntil = -2;
        send({ type: 'follow', id: id('follow'), target: 'player', distance: 4, speed: 2 });
      }
      break;
    case 'perception':
      if (followingUntil === -2) followingUntil = message.time + 20;
      if (followingUntil > 0 && message.time > followingUntil) {
        followingUntil = -1;
        send({ type: 'walk_to', id: id('home'), x: HOME.x, z: HOME.z });
      }
      break;
    case 'action_failed':
      log(`action ${message.id} failed: ${message.reason}`);
      break;
    case 'error':
      log(`the host says: ${message.message}`);
      break;
  }
});
