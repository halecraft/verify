/**
 * Command to execute for verification
 */
export interface VerificationCommand {
  /** The command/binary to run */
  cmd: string
  /** Arguments to pass to the command */
  args: string[]
  /** Working directory (defaults to cwd) */
  cwd?: string
  /** Environment variables to set */
  env?: Record<string, string>
}

/**
 * Result from parsing command output
 */
export interface ParsedResult {
  /** One-line summary for display */
  summary: string
  /** Optional metrics extracted from output */
  metrics?: {
    passed?: number
    failed?: number
    total?: number
    duration?: string
    errors?: number
    warnings?: number
  }
}

/**
 * Output parser interface
 */
export interface OutputParser {
  /** Unique identifier for this parser */
  id: string
  /** Parse command output and return structured result */
  parse(output: string, exitCode: number): ParsedResult | null
}

/**
 * Execution strategy for child nodes
 */
export type ExecutionStrategy = "parallel" | "sequential" | "fail-fast"

/**
 * A node in the verification tree
 */
export interface VerificationNode {
  /** Unique key for this node (used in CLI filtering) */
  key: string
  /** Human-readable name */
  name?: string
  /** Command to run (leaf nodes only) */
  run?: VerificationCommand | string | [string, string[]]
  /** Child verification nodes */
  children?: VerificationNode[]
  /** Execution strategy for children (default: parallel) */
  strategy?: ExecutionStrategy
  /** Parser ID to use for output (auto-detected if not specified) */
  parser?: string
  /** Success message template */
  successLabel?: string
  /** Failure message template */
  failureLabel?: string
}

/**
 * Options for the verification runner
 */
export interface VerifyOptions {
  /** Log verbosity: all, failed, none */
  logs?: "all" | "failed" | "none"
  /** Output format */
  format?: "human" | "json"
  /** Filter to specific task paths (e.g., "logic:ts") */
  filter?: string[]
  /** Working directory */
  cwd?: string
  /** Disable colors */
  noColor?: boolean
  /** Show all nested tasks (default: only top-level) */
  showAll?: boolean
}

/**
 * Package discovery options for monorepos
 */
export interface PackageDiscoveryOptions {
  /** Glob patterns for package directories */
  patterns?: string[]
  /** Filter to specific packages */
  filter?: string[]
  /** Include packages that have changed (git-aware) */
  changed?: boolean
}

/**
 * Root configuration for verify
 */
export interface VerifyConfig {
  /** Root verification tasks */
  tasks: VerificationNode[]
  /** Monorepo package discovery options */
  packages?: PackageDiscoveryOptions
  /** Default options */
  options?: VerifyOptions
}

/**
 * Result of a single verification task
 */
export interface TaskResult {
  /** Task key */
  key: string
  /** Full path in tree (e.g., "logic:ts") */
  path: string
  /** Whether the task passed */
  ok: boolean
  /** Exit code */
  code: number
  /** Duration in milliseconds */
  durationMs: number
  /** Raw output */
  output: string
  /** Parsed summary line */
  summaryLine: string
  /** Parsed metrics */
  metrics?: ParsedResult["metrics"]
  /** Child results (for group nodes) */
  children?: TaskResult[]
}

/**
 * Overall verification run result
 */
export interface VerifyResult {
  /** Whether all tasks passed */
  ok: boolean
  /** ISO timestamp when run started */
  startedAt: string
  /** ISO timestamp when run finished */
  finishedAt: string
  /** Total duration in milliseconds */
  durationMs: number
  /** Individual task results */
  tasks: TaskResult[]
}
