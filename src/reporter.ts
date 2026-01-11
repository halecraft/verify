import type { TaskResult, VerifyOptions, VerifyResult } from "./types.js"

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
 * Reporter interface
 */
export interface Reporter {
  /** Called when a task starts */
  onTaskStart(path: string, key: string): void
  /** Called when a task completes */
  onTaskComplete(result: TaskResult): void
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
 * TTY Reporter - colorful output for terminals
 */
export class TTYReporter implements Reporter {
  private colorEnabled: boolean
  private stream: NodeJS.WriteStream

  constructor(options: VerifyOptions = {}) {
    this.colorEnabled = shouldUseColors(options)
    // In JSON mode, human output goes to stderr
    this.stream = options.format === "json" ? process.stderr : process.stdout
  }

  private c(code: string, s: string): string {
    return this.colorEnabled ? `${code}${s}${ansi.reset}` : s
  }

  private okMark(): string {
    return this.colorEnabled ? this.c(ansi.green, "✓") : "OK"
  }

  private failMark(): string {
    return this.colorEnabled ? this.c(ansi.red, "✗") : "FAIL"
  }

  private arrow(): string {
    return this.colorEnabled ? this.c(ansi.cyan, "→") : "->"
  }

  private write(line: string): void {
    this.stream.write(line)
  }

  onTaskStart(path: string, _key: string): void {
    this.write(`${this.arrow()} starting ${this.c(ansi.bold, path)}\n`)
  }

  onTaskComplete(result: TaskResult): void {
    const mark = result.ok ? this.okMark() : this.failMark()
    const duration = this.c(ansi.dim, `(${result.durationMs}ms)`)
    this.write(
      `${mark} finished ${this.c(ansi.bold, result.path)} ${duration}\n`,
    )
  }

  outputLogs(results: TaskResult[], logsMode: "all" | "failed" | "none"): void {
    if (logsMode === "none") return

    const flatResults = this.flattenResults(results)

    for (const r of flatResults) {
      // Skip group nodes (they have no output)
      if (r.children) continue

      if (logsMode === "failed" && r.ok) continue

      const status = r.ok ? this.c(ansi.green, "OK") : this.c(ansi.red, "FAIL")

      this.write(
        `\n${this.c(ansi.bold, "====")} ${this.c(ansi.bold, r.path.toUpperCase())} ${status} ${this.c(ansi.bold, "====")}\n`,
      )
      this.write(r.output || "(no output)\n")
    }
  }

  outputSummary(result: VerifyResult): void {
    this.write("\n")

    const flatResults = this.flattenResults(result.tasks)
    for (const r of flatResults) {
      // Only show leaf nodes in summary
      if (r.children) continue

      const line = r.ok
        ? this.c(ansi.green, r.summaryLine)
        : this.c(ansi.red, r.summaryLine)
      this.write(`${line}\n`)
    }

    const finalMessage = result.ok
      ? this.c(ansi.green, "\n== verification: All correct ==")
      : this.c(ansi.red, "\n== verification: Failed ==")
    this.write(`${finalMessage}\n`)
  }

  private flattenResults(results: TaskResult[]): TaskResult[] {
    const flat: TaskResult[] = []
    for (const r of results) {
      flat.push(r)
      if (r.children) {
        flat.push(...this.flattenResults(r.children))
      }
    }
    return flat
  }
}

/**
 * JSON Reporter - machine-readable output
 */
export class JSONReporter implements Reporter {
  onTaskStart(_path: string, _key: string): void {
    // No output during execution in JSON mode
  }

  onTaskComplete(_result: TaskResult): void {
    // No output during execution in JSON mode
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
export class QuietReporter implements Reporter {
  private colorEnabled: boolean

  constructor(options: VerifyOptions = {}) {
    this.colorEnabled = shouldUseColors(options)
  }

  private c(code: string, s: string): string {
    return this.colorEnabled ? `${code}${s}${ansi.reset}` : s
  }

  onTaskStart(_path: string, _key: string): void {
    // No output
  }

  onTaskComplete(_result: TaskResult): void {
    // No output
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

  // Could add a "quiet" option in the future
  return new TTYReporter(options)
}
