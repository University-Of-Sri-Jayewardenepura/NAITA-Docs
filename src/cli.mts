#!/usr/bin/env bun

import { main } from './cli/main.mts';

main().catch((error) => {
  console.error(`Error: ${error.message}`);
  process.exitCode = 1;
});
