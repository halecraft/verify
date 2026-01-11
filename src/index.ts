// Types

// Config helpers
export {
  defineConfig,
  defineTask,
  findConfigFile,
  loadConfig,
  loadConfigFromCwd,
  mergeOptions,
} from "./config.js"
// Discovery
export {
  type DiscoveredPackage,
  discoverPackages,
  hasPackageChanged,
} from "./discovery.js"
// Init
export {
  type DetectedTask,
  detectTasks,
  generateConfigContent,
  type InitOptions,
  type InitResult,
  type OutputFormat,
  runInit,
} from "./init/index.js"
// Parsers
export {
  biomeParser,
  defaultRegistry,
  genericParser,
  gotestParser,
  ParserRegistry,
  tscParser,
  vitestParser,
} from "./parsers/index.js"

// Reporter
export {
  createReporter,
  JSONReporter,
  LiveDashboardReporter,
  QuietReporter,
  type Reporter,
  SequentialReporter,
  TTYReporter,
} from "./reporter.js"
// Runner
export { type RunnerCallbacks, VerificationRunner } from "./runner.js"
export type {
  ExecutionStrategy,
  OutputParser,
  PackageDiscoveryOptions,
  ParsedResult,
  TaskResult,
  VerificationCommand,
  VerificationNode,
  VerifyConfig,
  VerifyOptions,
  VerifyResult,
} from "./types.js"

import { loadConfigFromCwd, mergeOptions } from "./config.js"
import { createReporter } from "./reporter.js"
import { VerificationRunner } from "./runner.js"
// Main verify function
import type { VerifyConfig, VerifyOptions, VerifyResult } from "./types.js"

/**
 * Run verification with the given config and options
 */
export async function verify(
  config: VerifyConfig,
  cliOptions?: Partial<VerifyOptions>,
): Promise<VerifyResult> {
  const options = mergeOptions(config.options, cliOptions)
  const reporter = createReporter(options)

  // Initialize reporter with task list (for live dashboard)
  reporter.onStart?.(config.tasks)

  const runner = new VerificationRunner(options, undefined, {
    onTaskStart: (path, key) => reporter.onTaskStart(path, key),
    onTaskComplete: result => reporter.onTaskComplete(result),
  })

  const result = await runner.run(config.tasks)

  // Cleanup reporter (stop spinner, restore cursor)
  reporter.onFinish?.()

  reporter.outputLogs(result.tasks, options.logs ?? "failed")
  reporter.outputSummary(result)

  return result
}

/**
 * Run verification from config file in cwd
 */
export async function verifyFromConfig(
  cwd: string = process.cwd(),
  cliOptions?: Partial<VerifyOptions>,
): Promise<VerifyResult> {
  const config = await loadConfigFromCwd(cwd, cliOptions?.cwd)

  if (!config) {
    throw new Error(
      `No verify config found in ${cwd}. Create a verify.config.ts file.`,
    )
  }

  return verify(config, { ...cliOptions, cwd })
}
