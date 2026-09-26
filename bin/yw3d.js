#!/usr/bin/env node
// Entry point of the `yw3d` command: runs the TypeScript sources of the host through tsx.
import process from 'node:process';
import { register } from 'tsx/esm/api';

register();
const { main } = await import('../src/host/cli.ts');
const code = await main(process.argv.slice(2));
if (code !== 0) process.exit(code);
