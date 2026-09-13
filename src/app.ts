#!/usr/bin/env bun

import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { createCliRenderer } from '@opentui/core';
import { createDiaryApp } from './tui/app';
import { cliClient } from './tui/client';

async function main() {
  const { values } = parseArgs({
    args: process.argv.slice(2).filter((arg) => arg !== '--'),
    options: { workspace: { type: 'string' } },
    strict: true,
  });
  const renderer = await createCliRenderer({ exitOnCtrlC: true, consoleMode: 'disabled', backgroundColor: '#10131a' });
  try {
    await createDiaryApp(renderer, cliClient(resolve(values.workspace || process.cwd()))).start();
  } catch (error) {
    renderer.destroy();
    throw error;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
