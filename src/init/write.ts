import { existsSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"

/**
 * Result of checking if a file exists
 */
export interface FileCheckResult {
  exists: boolean
  path: string
}

/**
 * Check if the config file already exists
 */
export function checkConfigExists(
  cwd: string,
  configPath: string,
): FileCheckResult {
  const absolutePath = resolve(cwd, configPath)
  return {
    exists: existsSync(absolutePath),
    path: absolutePath,
  }
}

/**
 * Write the config file
 */
export function writeConfigFile(
  cwd: string,
  configPath: string,
  content: string,
): void {
  const absolutePath = resolve(cwd, configPath)
  writeFileSync(absolutePath, content, "utf-8")
}

/**
 * Print warning about existing file
 */
export function printExistsWarning(path: string): void {
  console.error(`\n⚠️  Config file already exists: ${path}`)
  console.error("   Use --force to overwrite.\n")
}

/**
 * Print success message
 */
export function printSuccess(path: string): void {
  console.log(`\n✅ Created ${path}`)
  console.log("\n   Run 'verify' to execute your verification tasks.\n")
}
