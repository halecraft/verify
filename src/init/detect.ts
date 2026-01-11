import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"

/**
 * A detected task candidate from package.json
 */
export interface DetectedTask {
  /** Suggested key for the task */
  key: string
  /** Human-readable name */
  name: string
  /** The npm script name that was detected */
  scriptName: string
  /** The command to run */
  command: string
  /** Category for grouping (format, types, logic, build) */
  category: "format" | "types" | "logic" | "build" | "other"
}

/**
 * Patterns to detect verification-related scripts
 */
const DETECTION_PATTERNS: Array<{
  pattern: RegExp
  key: string
  name: string
  category: DetectedTask["category"]
}> = [
  // Format/Lint patterns
  {
    pattern: /^(lint|eslint|biome|prettier|format)$/i,
    key: "format",
    name: "Format & Lint",
    category: "format",
  },
  {
    pattern: /^(lint:fix|format:fix|fix)$/i,
    key: "format",
    name: "Format & Lint",
    category: "format",
  },
  {
    pattern: /^verify:format$/i,
    key: "format",
    name: "Format",
    category: "format",
  },

  // Type checking patterns
  {
    pattern: /^(typecheck|type-check|tsc|types|check-types)$/i,
    key: "types",
    name: "Type Check",
    category: "types",
  },
  {
    pattern: /^verify:types$/i,
    key: "types",
    name: "Types",
    category: "types",
  },

  // Test patterns
  {
    pattern: /^(test|tests|vitest|jest|mocha|ava)$/i,
    key: "test",
    name: "Tests",
    category: "logic",
  },
  {
    pattern: /^test:(unit|integration|e2e)$/i,
    key: "test",
    name: "Tests",
    category: "logic",
  },
  {
    pattern: /^verify:logic$/i,
    key: "logic",
    name: "Logic Tests",
    category: "logic",
  },

  // Build patterns
  {
    pattern: /^(build|compile)$/i,
    key: "build",
    name: "Build",
    category: "build",
  },
]

/**
 * Read and parse package.json from a directory
 */
function readPackageJson(
  cwd: string,
): { scripts?: Record<string, string> } | null {
  const packageJsonPath = join(cwd, "package.json")

  if (!existsSync(packageJsonPath)) {
    return null
  }

  try {
    const content = readFileSync(packageJsonPath, "utf-8")
    return JSON.parse(content) as { scripts?: Record<string, string> }
  } catch {
    return null
  }
}

/**
 * Detect verification tasks from package.json scripts
 */
export function detectFromPackageJson(cwd: string): DetectedTask[] {
  const pkg = readPackageJson(cwd)

  if (!pkg?.scripts) {
    return []
  }

  const detected: DetectedTask[] = []
  const seenKeys = new Set<string>()

  for (const [scriptName, scriptCommand] of Object.entries(pkg.scripts)) {
    // Skip scripts that are just running other scripts (like "verify": "run-s ...")
    if (
      scriptCommand.includes("run-s") ||
      scriptCommand.includes("run-p") ||
      scriptCommand.includes("npm-run-all")
    ) {
      continue
    }

    // Check against detection patterns
    for (const { pattern, key, name, category } of DETECTION_PATTERNS) {
      if (pattern.test(scriptName)) {
        // Avoid duplicates for the same key
        const uniqueKey = seenKeys.has(key) ? `${key}-${scriptName}` : key
        if (!seenKeys.has(uniqueKey)) {
          seenKeys.add(uniqueKey)
          detected.push({
            key: uniqueKey,
            name,
            scriptName,
            command: `npm run ${scriptName}`,
            category,
          })
        }
        break
      }
    }
  }

  // Sort by category priority: format -> types -> logic -> build -> other
  const categoryOrder: Record<DetectedTask["category"], number> = {
    format: 0,
    types: 1,
    logic: 2,
    build: 3,
    other: 4,
  }

  detected.sort((a, b) => categoryOrder[a.category] - categoryOrder[b.category])

  return detected
}

/**
 * Detect the package manager being used
 */
export function detectPackageManager(cwd: string): "npm" | "pnpm" | "yarn" {
  if (existsSync(join(cwd, "pnpm-lock.yaml"))) {
    return "pnpm"
  }
  if (existsSync(join(cwd, "yarn.lock"))) {
    return "yarn"
  }
  return "npm"
}

/**
 * Get the run command for a package manager
 */
export function getRunCommand(
  packageManager: "npm" | "pnpm" | "yarn",
  scriptName: string,
): string {
  switch (packageManager) {
    case "pnpm":
      return `pnpm ${scriptName}`
    case "yarn":
      return `yarn ${scriptName}`
    default:
      return `npm run ${scriptName}`
  }
}

/**
 * Detect tasks with proper package manager commands
 */
export function detectTasks(cwd: string): DetectedTask[] {
  const packageManager = detectPackageManager(cwd)
  const tasks = detectFromPackageJson(cwd)

  // Update commands to use the detected package manager
  return tasks.map(task => ({
    ...task,
    command: getRunCommand(packageManager, task.scriptName),
  }))
}
