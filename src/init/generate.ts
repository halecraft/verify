import type { DetectedTask } from "./detect.js"

/**
 * Output format for the generated config
 */
export type OutputFormat = "ts" | "mts" | "js" | "mjs"

/**
 * Determine output format from file path
 */
export function getOutputFormat(filePath: string): OutputFormat {
  if (filePath.endsWith(".mts")) return "mts"
  if (filePath.endsWith(".mjs")) return "mjs"
  if (filePath.endsWith(".js")) return "js"
  return "ts" // Default to TypeScript
}

/**
 * Generate the import statement based on format
 */
function generateImport(format: OutputFormat): string {
  // All formats use ESM import syntax
  return `import { defineConfig } from "@halecraft/verify"`
}

/**
 * Generate a task object as a string
 */
function generateTask(task: DetectedTask, indent: string): string {
  return `${indent}{ key: "${task.key}", run: "${task.command}" }`
}

/**
 * Generate the skeleton config when no tasks are detected
 */
function generateSkeleton(format: OutputFormat): string {
  const importStatement = generateImport(format)

  return `${importStatement}

export default defineConfig({
  tasks: [
    // Add your verification tasks here
    // Example:
    // { key: "format", run: "pnpm lint" },
    // { key: "types", run: "pnpm typecheck" },
    // { key: "test", run: "pnpm test" },
  ],
})
`
}

/**
 * Generate config content from selected tasks
 */
export function generateConfigContent(
  tasks: DetectedTask[],
  format: OutputFormat,
): string {
  // If no tasks, generate skeleton
  if (tasks.length === 0) {
    return generateSkeleton(format)
  }

  const importStatement = generateImport(format)
  const indent = "    "

  // Group tasks by category for better organization
  const taskLines = tasks.map(task => generateTask(task, indent))

  return `${importStatement}

export default defineConfig({
  tasks: [
${taskLines.join(",\n")},
  ],
})
`
}

/**
 * Get the default config filename
 */
export function getDefaultConfigPath(): string {
  return "verify.config.ts"
}
