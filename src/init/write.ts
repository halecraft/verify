import { existsSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"
import type { DetectedTask } from "./detect.js"

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
 * Options for success message
 */
export interface SuccessOptions {
  /** Path to the created config file */
  configPath: string
  /** Tasks that were configured */
  tasks: DetectedTask[]
  /** Whether optimized commands were used */
  hasOptimizedCommands: boolean
  /** Script names that can potentially be removed */
  removableScripts: string[]
}

/**
 * Print success message with educational notes
 */
export function printSuccess(options: SuccessOptions): void {
  const { configPath, tasks, hasOptimizedCommands, removableScripts } = options

  console.log(`\n✅ Created ${configPath}`)
  console.log("")

  // Quick start
  console.log("   Quick start:")
  console.log("   $ verify              # Run all verifications")
  console.log("   $ verify --top-level  # Show only top-level tasks")
  console.log("   $ verify format       # Run only 'format' task")
  console.log("")

  // Performance note if optimized commands were used
  if (hasOptimizedCommands) {
    console.log(
      "   ⚡ Performance: Using direct tool paths for faster execution",
    )
    console.log(
      "      (avoids ~250ms overhead per command from package manager)",
    )
    console.log("")
  }

  // Cleanup suggestion if there are removable scripts
  if (removableScripts.length > 0) {
    console.log("   💡 Optional cleanup:")
    console.log(
      "      You can remove these scripts from package.json if you only",
    )
    console.log("      run them via 'verify' (keeps package.json cleaner):")
    for (const script of removableScripts) {
      console.log(`        - "${script}"`)
    }
    console.log("")
  }

  // Parser note if parsers were detected
  const tasksWithParsers = tasks.filter(t => t.parser)
  if (tasksWithParsers.length > 0) {
    console.log("   📊 Rich output: Parsers detected for detailed summaries:")
    for (const task of tasksWithParsers) {
      console.log(`        - ${task.key}: ${task.parser}`)
    }
    console.log("")
  }

  console.log("   📖 Docs: https://github.com/halecraft/verify")
  console.log("")
}
