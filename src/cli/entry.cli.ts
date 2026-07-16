#!/usr/bin/env node

import { runCli } from "./run-cli.js"

const exitCode = await runCli(process.argv.slice(2), {
  writeStandardOutput(text): void {
    process.stdout.write(text)
  },
  writeStandardError(text): void {
    process.stderr.write(text)
  },
})

process.exitCode = exitCode
