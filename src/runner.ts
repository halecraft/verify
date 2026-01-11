import { spawn } from "node:child_process"
import { defaultRegistry, type ParserRegistry } from "./parsers/index.js"
import type {
  ParsedResult,
  TaskResult,
  VerificationCommand,
  VerificationNode,
  VerifyOptions,
  VerifyResult,
} from "./types.js"

/**
 * Normalize command to VerificationCommand format
 */
function normalizeCommand(
  run: VerificationCommand | string | [string, string[]],
): VerificationCommand {
  if (typeof run === "string") {
    // Parse string command: "pnpm verify:format" -> { cmd: "pnpm", args: ["verify:format"] }
    const parts = run.split(/\s+/)
    return {
      cmd: parts[0],
      args: parts.slice(1),
    }
  }

  if (Array.isArray(run)) {
    return {
      cmd: run[0],
      args: run[1],
    }
  }

  return run
}

/**
 * Execute a single command and capture output
 */
async function executeCommand(
  command: VerificationCommand,
  cwd: string,
): Promise<{ code: number; output: string; durationMs: number }> {
  const start = Date.now()

  return new Promise(resolve => {
    const proc = spawn(command.cmd, command.args, {
      shell: process.platform === "win32",
      cwd: command.cwd ?? cwd,
      env: { ...process.env, NO_COLOR: "1", ...command.env },
    })

    let output = ""

    proc.stdout.on("data", (data: Buffer) => {
      output += data.toString()
    })

    proc.stderr.on("data", (data: Buffer) => {
      output += data.toString()
    })

    proc.on("close", code => {
      const durationMs = Date.now() - start
      resolve({
        code: code ?? 1,
        output,
        durationMs,
      })
    })

    proc.on("error", err => {
      const durationMs = Date.now() - start
      resolve({
        code: 1,
        output: `Failed to execute command: ${err.message}`,
        durationMs,
      })
    })
  })
}

/**
 * Build full path for a node
 */
function buildPath(parentPath: string, key: string): string {
  return parentPath ? `${parentPath}:${key}` : key
}

/**
 * Check if a path matches the filter
 */
function matchesFilter(path: string, filters?: string[]): boolean {
  if (!filters || filters.length === 0) {
    return true
  }

  return filters.some(filter => {
    // Exact match or prefix match
    return path === filter || path.startsWith(`${filter}:`)
  })
}

/**
 * Check if any descendant matches the filter
 */
function hasMatchingDescendant(
  node: VerificationNode,
  parentPath: string,
  filters?: string[],
): boolean {
  const path = buildPath(parentPath, node.key)

  if (matchesFilter(path, filters)) {
    return true
  }

  if (node.children) {
    return node.children.some(child =>
      hasMatchingDescendant(child, path, filters),
    )
  }

  return false
}

export interface RunnerCallbacks {
  onTaskStart?: (path: string, key: string) => void
  onTaskComplete?: (result: TaskResult) => void
}

/**
 * Verification runner
 */
export class VerificationRunner {
  private registry: ParserRegistry
  private options: VerifyOptions
  private callbacks: RunnerCallbacks

  constructor(
    options: VerifyOptions = {},
    registry: ParserRegistry = defaultRegistry,
    callbacks: RunnerCallbacks = {},
  ) {
    this.options = options
    this.registry = registry
    this.callbacks = callbacks
  }

  /**
   * Run all verification tasks
   */
  async run(tasks: VerificationNode[]): Promise<VerifyResult> {
    const startedAt = new Date().toISOString()
    const wallStart = Date.now()

    const results = await this.runNodes(tasks, "")

    const finishedAt = new Date().toISOString()
    const durationMs = Date.now() - wallStart

    const allOk = results.every(r => r.ok)

    return {
      ok: allOk,
      startedAt,
      finishedAt,
      durationMs,
      tasks: results,
    }
  }

  /**
   * Run a list of nodes with the appropriate strategy
   */
  private async runNodes(
    nodes: VerificationNode[],
    parentPath: string,
    strategy: "parallel" | "sequential" | "fail-fast" = "parallel",
  ): Promise<TaskResult[]> {
    // Filter nodes based on filter option
    const filteredNodes = nodes.filter(node =>
      hasMatchingDescendant(node, parentPath, this.options.filter),
    )

    if (filteredNodes.length === 0) {
      return []
    }

    switch (strategy) {
      case "parallel":
        return Promise.all(
          filteredNodes.map(node => this.runNode(node, parentPath)),
        )

      case "sequential": {
        const results: TaskResult[] = []
        for (const node of filteredNodes) {
          results.push(await this.runNode(node, parentPath))
        }
        return results
      }

      case "fail-fast": {
        const results: TaskResult[] = []
        for (const node of filteredNodes) {
          const result = await this.runNode(node, parentPath)
          results.push(result)
          if (!result.ok) {
            break
          }
        }
        return results
      }
    }
  }

  /**
   * Run a single node (leaf or group)
   */
  private async runNode(
    node: VerificationNode,
    parentPath: string,
  ): Promise<TaskResult> {
    const path = buildPath(parentPath, node.key)

    // Notify start
    this.callbacks.onTaskStart?.(path, node.key)

    // If this is a group node (has children), run children
    if (node.children && node.children.length > 0) {
      const start = Date.now()
      const childResults = await this.runNodes(
        node.children,
        path,
        node.strategy ?? "parallel",
      )
      const durationMs = Date.now() - start

      const allOk = childResults.every(r => r.ok)
      const result: TaskResult = {
        key: node.key,
        path,
        ok: allOk,
        code: allOk ? 0 : 1,
        durationMs,
        output: "",
        summaryLine: allOk
          ? (node.successLabel ?? `${node.key}: all passed`)
          : (node.failureLabel ?? `${node.key}: some failed`),
        children: childResults,
      }

      this.callbacks.onTaskComplete?.(result)
      return result
    }

    // Leaf node - execute command
    if (!node.run) {
      const result: TaskResult = {
        key: node.key,
        path,
        ok: true,
        code: 0,
        durationMs: 0,
        output: "",
        summaryLine: `${node.key}: no command specified`,
      }
      this.callbacks.onTaskComplete?.(result)
      return result
    }

    const command = normalizeCommand(node.run)
    const cwd = this.options.cwd ?? process.cwd()
    const { code, output, durationMs } = await executeCommand(command, cwd)

    const ok = code === 0

    // Parse output
    const cmdString = `${command.cmd} ${command.args.join(" ")}`
    const parsed: ParsedResult = this.registry.parse(
      output,
      code,
      node.parser,
      cmdString,
    )

    // Build summary line
    let summaryLine: string
    if (ok) {
      summaryLine = node.successLabel
        ? `${node.key}: ${node.successLabel}`
        : `${node.key}: ${parsed.summary}`
    } else {
      summaryLine = node.failureLabel
        ? `${node.key}: ${node.failureLabel}`
        : `${node.key}: ${parsed.summary}`
    }

    const result: TaskResult = {
      key: node.key,
      path,
      ok,
      code,
      durationMs,
      output,
      summaryLine,
      metrics: parsed.metrics,
    }

    this.callbacks.onTaskComplete?.(result)
    return result
  }
}
