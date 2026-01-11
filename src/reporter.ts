import { SpinnerManager } from "./spinner.js"
import type {
  TaskResult,
  VerificationNode,
  VerifyOptions,
  VerifyResult,
} from "./types.js"

/**
 * ANSI color codes
 */
const ansi = {
  reset: "\u001b[0m",
  dim: "\u001b[2m",
  red: "\u001b[31m",
  green: "\u001b[32m",
  yellow: "\u001b[33m",
  cyan: "\u001b[36m",
  bold: "\u001b[1m",
}

/**
 * ANSI cursor control codes
 */
const cursor = {
  hide: "\u001b[?25l",
  show: "\u001b[?25h",
  moveUp: (n: number) => `\u001b[${n}A`,
  moveToStart: "\u001b[0G",
  clearLine: "\u001b[2K",
}

/**
 * Reporter interface
 */
export interface Reporter {
  /** Called before any tasks start - initialize display */
  onStart?(tasks: VerificationNode[]): void
  /** Called when a task starts */
  onTaskStart(path: string, key: string): void
  /** Called when a task completes */
  onTaskComplete(result: TaskResult): void
  /** Called when all tasks complete - cleanup display */
  onFinish?(): void
  /** Called to output task logs */
  outputLogs(results: TaskResult[], logsMode: "all" | "failed" | "none"): void
  /** Called to output final summary */
  outputSummary(result: VerifyResult): void
}

/**
 * Check if colors should be enabled
 */
function shouldUseColors(options: VerifyOptions): boolean {
  if (options.noColor) return false
  if (options.format === "json") return false
  if (!process.stdout.isTTY) return false
  if ("NO_COLOR" in process.env) return false
  if (process.env.TERM === "dumb") return false
  return true
}

/**
 * Base Reporter - common functionality for all reporters
 */
export abstract class BaseReporter implements Reporter {
  protected colorEnabled: boolean
  protected stream: NodeJS.WriteStream
  protected taskDepths: Map<string, number> = new Map()

  constructor(options: VerifyOptions = {}) {
    this.colorEnabled = shouldUseColors(options)
    this.stream = options.format === "json" ? process.stderr : process.stdout
  }

  /**
   * Apply ANSI color code to string (if colors enabled)
   */
  protected c(code: string, s: string): string {
    return this.colorEnabled ? `${code}${s}${ansi.reset}` : s
  }

  /**
   * Get success mark (✓ or OK)
   */
  protected okMark(): string {
    return this.colorEnabled ? this.c(ansi.green, "✓") : "OK"
  }

  /**
   * Get failure mark (✗ or FAIL)
   */
  protected failMark(): string {
    return this.colorEnabled ? this.c(ansi.red, "✗") : "FAIL"
  }

  /**
   * Get arrow symbol (→ or ->)
   */
  protected arrow(): string {
    return this.colorEnabled ? this.c(ansi.cyan, "→") : "->"
  }

  /**
   * Get indentation string for a given depth
   */
  protected getIndent(depth: number): string {
    return "  ".repeat(depth)
  }

  /**
   * Get task depth from path
   */
  protected getTaskDepth(path: string): number {
    return this.taskDepths.get(path) ?? 0
  }

  /**
   * Recursively collect task depths from verification tree
   */
  protected collectTaskDepths(
    nodes: VerificationNode[],
    parentPath: string,
    depth: number,
  ): void {
    for (const node of nodes) {
      const path = parentPath ? `${parentPath}:${node.key}` : node.key
      this.taskDepths.set(path, depth)

      if (node.children) {
        this.collectTaskDepths(node.children, path, depth + 1)
      }
    }
  }

  /**
   * Extract summary from task result
   */
  protected extractSummary(result: TaskResult): string {
    // Use the parsed summary from summaryLine (strip the "key: " prefix if present)
    // The parsers already format summaries nicely with file counts, test counts, etc.
    if (result.summaryLine) {
      const colonIndex = result.summaryLine.indexOf(": ")
      if (colonIndex !== -1) {
        return result.summaryLine.slice(colonIndex + 2)
      }
      return result.summaryLine
    }

    return result.ok ? "passed" : "failed"
  }

  /**
   * Flatten nested task results into a single array
   */
  protected flattenResults(results: TaskResult[]): TaskResult[] {
    const flat: TaskResult[] = []
    for (const r of results) {
      flat.push(r)
      if (r.children) {
        flat.push(...this.flattenResults(r.children))
      }
    }
    return flat
  }

  /**
   * Output task logs
   */
  outputLogs(results: TaskResult[], logsMode: "all" | "failed" | "none"): void {
    if (logsMode === "none") return

    const flatResults = this.flattenResults(results)

    for (const r of flatResults) {
      if (r.children) continue
      if (logsMode === "failed" && r.ok) continue

      const status = r.ok ? this.c(ansi.green, "OK") : this.c(ansi.red, "FAIL")

      this.stream.write(
        `\n${this.c(ansi.bold, "====")} ${this.c(ansi.bold, r.path.toUpperCase())} ${status} ${this.c(ansi.bold, "====")}\n`,
      )
      this.stream.write(r.output || "(no output)\n")
    }
  }

  /**
   * Output final summary
   */
  outputSummary(result: VerifyResult): void {
    const finalMessage = result.ok
      ? this.c(ansi.green, "\n== verification: All correct ==")
      : this.c(ansi.red, "\n== verification: Failed ==")
    this.stream.write(`${finalMessage}\n`)
  }

  // Abstract methods that subclasses must implement
  abstract onStart(tasks: VerificationNode[]): void
  abstract onTaskStart(path: string, key: string): void
  abstract onTaskComplete(result: TaskResult): void
  abstract onFinish(): void
}

/**
 * Task state for live dashboard
 */
interface TaskState {
  key: string
  path: string
  depth: number
  status: "pending" | "running" | "completed"
  result?: TaskResult
}

/**
 * Live Dashboard Reporter - animated in-place updates for TTY
 */
export class LiveDashboardReporter extends BaseReporter {
  private showAll: boolean
  private tasks: Map<string, TaskState> = new Map()
  private taskOrder: string[] = []
  private spinner: SpinnerManager
  private lineCount = 0

  constructor(options: VerifyOptions = {}) {
    super(options)
    this.showAll = options.showAll ?? false
    this.spinner = new SpinnerManager()

    // Handle Ctrl+C to restore cursor
    const cleanup = () => {
      this.spinner.stop()
      this.stream.write(cursor.show)
      process.exit(130)
    }
    process.on("SIGINT", cleanup)
    process.on("SIGTERM", cleanup)
  }

  /**
   * Initialize task list from verification nodes
   */
  onStart(tasks: VerificationNode[]): void {
    this.collectTasks(tasks, "", 0)
    this.stream.write(cursor.hide)
    this.spinner.start(() => this.redraw())
  }

  /**
   * Recursively collect tasks from verification tree
   */
  private collectTasks(
    nodes: VerificationNode[],
    parentPath: string,
    depth: number,
  ): void {
    for (const node of nodes) {
      const path = parentPath ? `${parentPath}:${node.key}` : node.key
      this.tasks.set(path, {
        key: node.key,
        path,
        depth,
        status: "pending",
      })
      this.taskOrder.push(path)
      // Also store in base class for consistency
      this.taskDepths.set(path, depth)

      if (node.children) {
        this.collectTasks(node.children, path, depth + 1)
      }
    }
  }

  /**
   * Get display key - shows :key for nested, key for root
   */
  private getDisplayKey(task: TaskState): string {
    if (task.depth === 0) {
      return task.key
    }
    return `:${task.key}`
  }

  /**
   * Check if task should be displayed based on showAll flag
   */
  private shouldDisplay(task: TaskState): boolean {
    if (this.showAll) return true
    return task.depth === 0
  }

  /**
   * Format a single task line
   */
  private formatLine(task: TaskState): string {
    const indent = this.getIndent(task.depth)
    const displayKey = this.getDisplayKey(task)

    if (task.status === "running") {
      const spinnerChar = this.c(ansi.dim, `(${this.spinner.getFrame()})`)
      return `${indent}${this.arrow()} verifying ${this.c(ansi.bold, displayKey)} ${spinnerChar}`
    }

    if (task.status === "completed" && task.result) {
      const duration = this.c(ansi.dim, `${task.result.durationMs}ms`)
      const summary = this.extractSummary(task.result)

      if (task.result.ok) {
        return ` ${indent}${this.okMark()} verified ${this.c(ansi.bold, displayKey)} ${this.c(ansi.dim, `(${summary}, ${duration})`)}`
      }
      return `${indent}${this.failMark()}    failed ${this.c(ansi.bold, displayKey)} ${this.c(ansi.dim, `(${summary}, ${duration})`)}`
    }

    // Pending - don't show
    return ""
  }

  /**
   * Redraw all visible task lines
   */
  private redraw(): void {
    // Move cursor up to overwrite previous lines
    if (this.lineCount > 0) {
      this.stream.write(cursor.moveUp(this.lineCount))
    }

    // Build new output
    const lines: string[] = []
    for (const path of this.taskOrder) {
      const task = this.tasks.get(path)
      if (!task) continue
      if (!this.shouldDisplay(task)) continue
      if (task.status === "pending") continue

      const line = this.formatLine(task)
      if (line) {
        lines.push(line)
      }
    }

    // Write lines with clear
    for (const line of lines) {
      this.stream.write(`${cursor.clearLine}${cursor.moveToStart}${line}\n`)
    }

    this.lineCount = lines.length
  }

  onTaskStart(path: string, _key: string): void {
    const task = this.tasks.get(path)
    if (task) {
      task.status = "running"
    }
    // Redraw happens on spinner tick
  }

  onTaskComplete(result: TaskResult): void {
    const task = this.tasks.get(result.path)
    if (task) {
      task.status = "completed"
      task.result = result
    }
    // Redraw happens on spinner tick, but do one now for immediate feedback
    this.redraw()
  }

  onFinish(): void {
    this.spinner.stop()
    this.redraw() // Final redraw
    this.stream.write(cursor.show)
  }
}

/**
 * Sequential Reporter - line-by-line output for non-TTY
 */
export class SequentialReporter extends BaseReporter {
  onStart(tasks: VerificationNode[]): void {
    // Collect task depths from the config tree
    this.collectTaskDepths(tasks, "", 0)
  }

  onTaskStart(path: string, _key: string): void {
    const depth = this.getTaskDepth(path)
    const indent = this.getIndent(depth)
    this.stream.write(
      `${indent}${this.arrow()} verifying ${this.c(ansi.bold, path)}\n`,
    )
  }

  onTaskComplete(result: TaskResult): void {
    const depth = this.getTaskDepth(result.path)
    const indent = this.getIndent(depth)
    const mark = result.ok ? this.okMark() : this.failMark()
    const verb = result.ok ? "verified" : "failed"
    const summary = this.extractSummary(result)
    const duration = this.c(ansi.dim, `${result.durationMs}ms`)
    this.stream.write(
      `${indent}${mark} ${verb} ${this.c(ansi.bold, result.path)} ${this.c(ansi.dim, `(${summary}, ${duration})`)}\n`,
    )
  }

  onFinish(): void {
    // No cleanup needed for sequential output
  }
}

/**
 * JSON Reporter - machine-readable output
 */
export class JSONReporter implements Reporter {
  onStart(_tasks: VerificationNode[]): void {
    // No output during execution in JSON mode
  }

  onTaskStart(_path: string, _key: string): void {
    // No output during execution in JSON mode
  }

  onTaskComplete(_result: TaskResult): void {
    // No output during execution in JSON mode
  }

  onFinish(): void {
    // No cleanup needed for JSON output
  }

  outputLogs(
    _results: TaskResult[],
    _logsMode: "all" | "failed" | "none",
  ): void {
    // Logs are included in the JSON output
  }

  outputSummary(result: VerifyResult): void {
    const summary = {
      ok: result.ok,
      startedAt: result.startedAt,
      finishedAt: result.finishedAt,
      durationMs: result.durationMs,
      tasks: this.serializeTasks(result.tasks),
    }

    process.stdout.write(`${JSON.stringify(summary)}\n`)
  }

  private serializeTasks(tasks: TaskResult[]): Array<{
    key: string
    path: string
    ok: boolean
    code: number
    durationMs: number
    summaryLine: string
    children?: ReturnType<JSONReporter["serializeTasks"]>
  }> {
    return tasks.map(t => ({
      key: t.key,
      path: t.path,
      ok: t.ok,
      code: t.code,
      durationMs: t.durationMs,
      summaryLine: t.summaryLine,
      ...(t.children ? { children: this.serializeTasks(t.children) } : {}),
    }))
  }
}

/**
 * Quiet Reporter - minimal output (summary only)
 */
export class QuietReporter extends BaseReporter {
  onStart(_tasks: VerificationNode[]): void {
    // No output
  }

  onTaskStart(_path: string, _key: string): void {
    // No output
  }

  onTaskComplete(_result: TaskResult): void {
    // No output
  }

  onFinish(): void {
    // No cleanup needed
  }

  outputLogs(
    _results: TaskResult[],
    _logsMode: "all" | "failed" | "none",
  ): void {
    // No logs in quiet mode
  }

  outputSummary(result: VerifyResult): void {
    const message = result.ok
      ? this.c(ansi.green, "✓ All verifications passed")
      : this.c(ansi.red, "✗ Some verifications failed")
    process.stdout.write(`${message}\n`)
  }
}

/**
 * Create appropriate reporter based on options
 */
export function createReporter(options: VerifyOptions): Reporter {
  if (options.format === "json") {
    return new JSONReporter()
  }

  // Use LiveDashboardReporter for TTY (unless --no-tty is set)
  if (process.stdout.isTTY && !options.noTty) {
    return new LiveDashboardReporter(options)
  }

  return new SequentialReporter(options)
}

// Keep TTYReporter as alias for backwards compatibility
export { SequentialReporter as TTYReporter }
