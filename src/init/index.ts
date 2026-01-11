import { detectTasks } from "./detect.js"
import {
  generateConfigContent,
  getDefaultConfigPath,
  getOutputFormat,
} from "./generate.js"
import { promptForTasks, shouldSkipPrompts } from "./prompts.js"
import {
  checkConfigExists,
  printExistsWarning,
  printSuccess,
  writeConfigFile,
} from "./write.js"

/**
 * Options for the init command
 */
export interface InitOptions {
  /** Custom config output path */
  config?: string
  /** Force overwrite existing file */
  force: boolean
  /** Skip interactive prompts */
  yes: boolean
  /** Working directory */
  cwd: string
}

/**
 * Result of the init command
 */
export interface InitResult {
  /** Whether init succeeded */
  success: boolean
  /** Path to the created config file (if successful) */
  configPath?: string
  /** Error message (if failed) */
  error?: string
}

/**
 * Run the init command
 */
export async function runInit(options: InitOptions): Promise<InitResult> {
  const configPath = options.config ?? getDefaultConfigPath()
  const format = getOutputFormat(configPath)

  // Check if file already exists
  const fileCheck = checkConfigExists(options.cwd, configPath)
  if (fileCheck.exists && !options.force) {
    printExistsWarning(fileCheck.path)
    return {
      success: false,
      error: "Config file already exists. Use --force to overwrite.",
    }
  }

  // Detect tasks from package.json
  const detectedTasks = detectTasks(options.cwd)

  // Determine if we should skip prompts
  const isTTY = process.stdout.isTTY ?? false
  const promptOptions = {
    yes: options.yes,
    isTTY,
  }

  // If not skipping prompts, show what we're doing
  if (!shouldSkipPrompts(promptOptions)) {
    console.log("\n🚀 Initializing @halecraft/verify config...\n")
  }

  // Run interactive prompts (or auto-select)
  const promptResult = await promptForTasks(detectedTasks, promptOptions)

  if (promptResult.cancelled) {
    console.log("\n❌ Cancelled.\n")
    return {
      success: false,
      error: "User cancelled",
    }
  }

  // Generate config content
  const content = generateConfigContent(promptResult.tasks, format)

  // Write the file
  try {
    writeConfigFile(options.cwd, configPath, content)
    printSuccess(configPath)
    return {
      success: true,
      configPath,
    }
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to write config file"
    console.error(`\n❌ Error: ${message}\n`)
    return {
      success: false,
      error: message,
    }
  }
}

// Re-export types and utilities
export type { DetectedTask } from "./detect.js"
export { detectTasks } from "./detect.js"
export type { OutputFormat } from "./generate.js"
export { generateConfigContent, getOutputFormat } from "./generate.js"
