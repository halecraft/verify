#!/usr/bin/env node

import { runInit, verifyFromConfig } from "../dist/index.js"

/**
 * Parse CLI arguments
 */
function parseArgs(args) {
  const options = {
    json: false,
    verbose: false,
    quiet: false,
    logs: undefined,
    filter: [],
    config: undefined,
    help: false,
    init: false,
    force: false,
    yes: false,
    all: false,
  }

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]

    if (arg === "--json") {
      options.json = true
    } else if (arg === "--verbose" || arg === "-v") {
      options.verbose = true
    } else if (arg === "--quiet" || arg === "-q") {
      options.quiet = true
    } else if (arg === "--help" || arg === "-h") {
      options.help = true
    } else if (arg === "--init") {
      options.init = true
    } else if (arg === "--force") {
      options.force = true
    } else if (arg === "--yes" || arg === "-y") {
      options.yes = true
    } else if (arg === "--all" || arg === "-a") {
      options.all = true
    } else if (arg.startsWith("--logs=")) {
      options.logs = arg.slice(7)
    } else if (arg === "--logs") {
      options.logs = args[++i]
    } else if (arg.startsWith("--config=")) {
      options.config = arg.slice(9)
    } else if (arg === "--config" || arg === "-c") {
      options.config = args[++i]
    } else if (arg.startsWith("--filter=")) {
      options.filter.push(arg.slice(9))
    } else if (arg === "--filter" || arg === "-f") {
      options.filter.push(args[++i])
    } else if (!arg.startsWith("-")) {
      // Positional argument treated as filter
      options.filter.push(arg)
    }
  }

  return options
}

/**
 * Print help message
 */
function printHelp() {
  console.log(`
@halecraft/verify - Hierarchical verification runner

Usage:
  verify [options] [filter...]

Options:
  --json              Output results as JSON
  --verbose, -v       Show all task output
  --quiet, -q         Show only final result
  --all, -a           Show all nested tasks (default: top-level only)
  --logs=MODE         Log verbosity: all, failed, none (default: failed)
  --config, -c PATH   Path to config file (or output path for --init)
  --filter, -f PATH   Filter to specific task paths
  --init              Initialize a new verify.config.ts file
  --force             Overwrite existing config file (with --init)
  --yes, -y           Skip interactive prompts, auto-accept detected tasks
  --help, -h          Show this help message

Examples:
  verify                    Run all verifications
  verify logic              Run only 'logic' tasks
  verify logic:ts           Run only 'logic:ts' task
  verify --all              Show all nested tasks with indentation
  verify --json             Output JSON for CI
  verify --logs=all         Show all output
  verify --init             Create config interactively
  verify --init -y          Create config with all detected tasks
  verify --init --force     Overwrite existing config

Config:
  Create a verify.config.ts file in your project root:

  import { defineConfig } from '@halecraft/verify'

  export default defineConfig({
    tasks: [
      { key: 'format', run: 'pnpm verify:format' },
      { key: 'types', run: 'pnpm verify:types' },
      {
        key: 'logic',
        children: [
          { key: 'ts', run: 'vitest run' },
          { key: 'go', run: 'go test ./...' },
        ],
      },
    ],
  })
`)
}

async function main() {
  const args = process.argv.slice(2)
  const options = parseArgs(args)

  if (options.help) {
    printHelp()
    process.exit(0)
  }

  // Handle --init command
  if (options.init) {
    try {
      const result = await runInit({
        config: options.config,
        force: options.force,
        yes: options.yes,
        cwd: process.cwd(),
      })
      process.exit(result.success ? 0 : 1)
    } catch (error) {
      if (error instanceof Error) {
        console.error(`Error: ${error.message}`)
      } else {
        console.error("Unknown error occurred")
      }
      process.exit(1)
    }
  }

  // Build verify options
  const verifyOptions = {
    format: options.json ? "json" : "human",
    logs:
      options.logs ??
      (options.verbose ? "all" : options.quiet ? "none" : "failed"),
    filter: options.filter.length > 0 ? options.filter : undefined,
    cwd: options.config,
    showAll: options.all,
  }

  try {
    const result = await verifyFromConfig(process.cwd(), verifyOptions)
    process.exit(result.ok ? 0 : 1)
  } catch (error) {
    if (error instanceof Error) {
      console.error(`Error: ${error.message}`)
    } else {
      console.error("Unknown error occurred")
    }
    process.exit(1)
  }
}

main()
