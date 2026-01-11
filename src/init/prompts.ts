import type { DetectedTask } from "./detect.js"

/**
 * Options for the prompt flow
 */
export interface PromptOptions {
  /** Skip interactive prompts and auto-accept all */
  yes: boolean
  /** Whether we're in a TTY environment */
  isTTY: boolean
}

/**
 * Result of the prompt flow
 */
export interface PromptResult {
  /** Selected tasks */
  tasks: DetectedTask[]
  /** Whether the user cancelled */
  cancelled: boolean
}

/**
 * Check if we should skip prompts
 */
export function shouldSkipPrompts(options: PromptOptions): boolean {
  return options.yes || !options.isTTY
}

/**
 * Run the interactive task selection prompt
 */
export async function promptForTasks(
  detectedTasks: DetectedTask[],
  options: PromptOptions,
): Promise<PromptResult> {
  // If no tasks detected, return empty (will use skeleton)
  if (detectedTasks.length === 0) {
    if (!shouldSkipPrompts(options)) {
      console.log(
        "\n⚠️  No verification scripts detected in package.json.\n   A skeleton config will be created.\n",
      )
    }
    return { tasks: [], cancelled: false }
  }

  // If skipping prompts, return all detected tasks
  if (shouldSkipPrompts(options)) {
    console.log(`\n✓ Auto-selecting ${detectedTasks.length} detected task(s)\n`)
    return { tasks: detectedTasks, cancelled: false }
  }

  // Dynamic import of @inquirer/prompts to avoid loading it when not needed
  try {
    const { checkbox } = await import("@inquirer/prompts")

    console.log("\n🔍 Detected verification scripts in package.json:\n")

    const choices = detectedTasks.map(task => ({
      name: `${task.name} (${task.command})`,
      value: task,
      checked: true, // Pre-select all by default
    }))

    const selected = await checkbox<DetectedTask>({
      message: "Select tasks to include in your config:",
      choices,
      instructions: false,
    })

    if (selected.length === 0) {
      console.log("\n⚠️  No tasks selected. A skeleton config will be created.\n")
    }

    return { tasks: selected, cancelled: false }
  } catch (error) {
    // Handle Ctrl+C or other cancellation
    if (
      error instanceof Error &&
      (error.message.includes("User force closed") ||
        error.name === "ExitPromptError")
    ) {
      return { tasks: [], cancelled: true }
    }
    throw error
  }
}
