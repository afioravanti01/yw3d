const canvas = document.querySelector<HTMLCanvasElement>('#world');
if (!canvas) {
  throw new Error('Missing #world canvas');
}
