import { existsSync } from "node:fs"
import { join, resolve } from "node:path"
import { pathToFileURL } from "node:url"
import type { VerificationNode, VerifyConfig, VerifyOptions } from "./types.js"

/**
 * Helper function for defining config with type inference
 */
export function defineConfig(config: VerifyConfig): VerifyConfig {
  return config
}

/**
 * Helper function for defining a single verification task
 */
export function defineTask(task: VerificationNode): VerificationNode {
  return task
}

/**
 * Config file names to search for (in order of priority)
 */
const CONFIG_FILES = [
  "verify.config.ts",
  "verify.config.mts",
  "verify.config.js",
  "verify.config.mjs",
]

/**
 * Find config file in directory
 */
export function findConfigFile(cwd: string): string | null {
  for (const filename of CONFIG_FILES) {
    const filepath = join(cwd, filename)
    if (existsSync(filepath)) {
      return filepath
    }
  }
  return null
}

/**
 * Load config from file
 */
export async function loadConfig(
  configPath: string,
): Promise<VerifyConfig | null> {
  const absolutePath = resolve(configPath)

  if (!existsSync(absolutePath)) {
    return null
  }

  // Use dynamic import with file URL for cross-platform compatibility
  const fileUrl = pathToFileURL(absolutePath).href
  const module = (await import(fileUrl)) as { default?: VerifyConfig }

  if (!module.default) {
    throw new Error(`Config file ${configPath} must have a default export`)
  }

  return module.default
}

/**
 * Load config from cwd or specified path
 */
export async function loadConfigFromCwd(
  cwd: string,
  configPath?: string,
): Promise<VerifyConfig | null> {
  if (configPath) {
    return loadConfig(configPath)
  }

  const foundPath = findConfigFile(cwd)
  if (!foundPath) {
    return null
  }

  return loadConfig(foundPath)
}

/**
 * Merge options with defaults
 */
export function mergeOptions(
  configOptions?: VerifyOptions,
  cliOptions?: Partial<VerifyOptions>,
): VerifyOptions {
  return {
    logs: cliOptions?.logs ?? configOptions?.logs ?? "failed",
    format: cliOptions?.format ?? configOptions?.format ?? "human",
    filter: cliOptions?.filter ?? configOptions?.filter,
    cwd: cliOptions?.cwd ?? configOptions?.cwd ?? process.cwd(),
    noColor: cliOptions?.noColor ?? configOptions?.noColor ?? false,
  }
}
