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
  /** The command to run (optimized direct path when possible) */
  command: string
  /** Category for grouping (format, types, logic, build) */
  category: "format" | "types" | "logic" | "build" | "other"
  /** Parser to use for this task */
  parser?: string
}

/**
 * Tool detection patterns - maps script content to optimized commands
 */
interface ToolPattern {
  /** Regex to match in script content */
  pattern: RegExp
  /** Binary name in node_modules/.bin */
  binary: string
  /** Arguments to append (extracted from script or default) */
  getArgs: (match: RegExpMatchArray, scriptContent: string) => string
  /** Parser to use */
  parser?: string
}

const TOOL_PATTERNS: ToolPattern[] = [
  // Biome
  {
    pattern: /\bbiome\s+(check|lint|format)/,
    binary: "biome",
    getArgs: (match, content) => {
      // Extract the full biome command with args
      const biomeMatch = content.match(/biome\s+([^&|;]+)/)
      return biomeMatch ? biomeMatch[1].trim() : "check ."
    },
    parser: "biome",
  },
  // ESLint
  {
    pattern: /\beslint\b/,
    binary: "eslint",
    getArgs: (_, content) => {
      const eslintMatch = content.match(/eslint\s+([^&|;]+)/)
      return eslintMatch ? eslintMatch[1].trim() : "."
    },
  },
  // Prettier
  {
    pattern: /\bprettier\b/,
    binary: "prettier",
    getArgs: (_, content) => {
      const prettierMatch = content.match(/prettier\s+([^&|;]+)/)
      return prettierMatch ? prettierMatch[1].trim() : "--check ."
    },
  },
  // TypeScript
  {
    pattern: /\btsc\b/,
    binary: "tsc",
    getArgs: (_, content) => {
      const tscMatch = content.match(/tsc\s+([^&|;]+)/)
      return tscMatch ? tscMatch[1].trim() : "--noEmit"
    },
    parser: "tsc",
  },
  // tsgo
  {
    pattern: /\btsgo\b/,
    binary: "tsgo",
    getArgs: (_, content) => {
      const tsgoMatch = content.match(/tsgo\s+([^&|;]+)/)
      return tsgoMatch ? tsgoMatch[1].trim() : "--noEmit"
    },
    parser: "tsc",
  },
  // Vitest
  {
    pattern: /\bvitest\b/,
    binary: "vitest",
    getArgs: (_, content) => {
      // Check if it's watch mode or run mode
      if (content.includes("vitest run")) return "run"
      if (content.includes("vitest watch")) return "run" // Convert watch to run for verify
      return "run"
    },
    parser: "vitest",
  },
  // Jest
  {
    pattern: /\bjest\b/,
    binary: "jest",
    getArgs: () => "",
  },
  // Mocha
  {
    pattern: /\bmocha\b/,
    binary: "mocha",
    getArgs: () => "",
  },
  // tsup
  {
    pattern: /\btsup\b/,
    binary: "tsup",
    getArgs: (_, content) => {
      const tsupMatch = content.match(/tsup\s+([^&|;]+)/)
      return tsupMatch ? tsupMatch[1].trim() : ""
    },
  },
  // esbuild
  {
    pattern: /\besbuild\b/,
    binary: "esbuild",
    getArgs: (_, content) => {
      const esbuildMatch = content.match(/esbuild\s+([^&|;]+)/)
      return esbuildMatch ? esbuildMatch[1].trim() : ""
    },
  },
]

/**
 * Patterns to detect verification-related scripts by name
 */
const SCRIPT_NAME_PATTERNS: Array<{
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
 * Check if a binary exists in node_modules/.bin
 */
function binaryExists(cwd: string, binary: string): boolean {
  return existsSync(join(cwd, "node_modules", ".bin", binary))
}

/**
 * Try to extract an optimized direct command from script content
 */
function extractOptimizedCommand(
  cwd: string,
  scriptContent: string,
): { command: string; parser?: string } | null {
  for (const tool of TOOL_PATTERNS) {
    const match = scriptContent.match(tool.pattern)
    if (match && binaryExists(cwd, tool.binary)) {
      const args = tool.getArgs(match, scriptContent)
      const command = args
        ? `./node_modules/.bin/${tool.binary} ${args}`
        : `./node_modules/.bin/${tool.binary}`
      return { command, parser: tool.parser }
    }
  }
  return null
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

  for (const [scriptName, scriptContent] of Object.entries(pkg.scripts)) {
    // Skip scripts that are just running other scripts (like "verify": "run-s ...")
    if (
      scriptContent.includes("run-s") ||
      scriptContent.includes("run-p") ||
      scriptContent.includes("npm-run-all")
    ) {
      continue
    }

    // Check against detection patterns
    for (const { pattern, key, name, category } of SCRIPT_NAME_PATTERNS) {
      if (pattern.test(scriptName)) {
        // Avoid duplicates for the same key
        const uniqueKey = seenKeys.has(key) ? `${key}-${scriptName}` : key
        if (!seenKeys.has(uniqueKey)) {
          seenKeys.add(uniqueKey)

          // Try to extract optimized command
          const optimized = extractOptimizedCommand(cwd, scriptContent)

          detected.push({
            key: uniqueKey,
            name,
            scriptName,
            command: optimized?.command ?? `npm run ${scriptName}`,
            category,
            parser: optimized?.parser,
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
 * Uses optimized direct paths when possible, falls back to package manager
 */
export function detectTasks(cwd: string): DetectedTask[] {
  const packageManager = detectPackageManager(cwd)
  const tasks = detectFromPackageJson(cwd)

  // For tasks without optimized commands, use package manager
  return tasks.map(task => {
    // If command is already optimized (starts with ./), keep it
    if (task.command.startsWith("./")) {
      return task
    }
    // Otherwise use package manager command
    return {
      ...task,
      command: getRunCommand(packageManager, task.scriptName),
    }
  })
}
