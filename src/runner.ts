import { type ChildProcess, spawn } from "node:child_process"
import treeKill from "tree-kill"
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
 * Tracks reporting dependencies between tasks and coordinates result emission.
 * Allows tasks to wait for their dependencies to complete before emitting results,
 * and determines if a task's failure should be suppressed.
 * Also handles early termination by killing dependent processes when a dependency fails.
 */
export class ReportingDependencyTracker {
  /** Map of task path/key to their results */
  private results: Map<string, TaskResult> = new Map()

  /** Map of task path/key to waiters (callbacks to resolve when result is available) */
  private waiters: Map<string, Array<() => void>> = new Map()

  /** Map of task path to its key (for key-based lookups) */
  private pathToKey: Map<string, string> = new Map()

  /** Map of task key to its path (for key-based lookups) */
  private keyToPath: Map<string, string> = new Map()

  /** Map of task path to its reportingDependsOn array */
  private dependencies: Map<string, string[]> = new Map()

  /** Reverse map: task path → list of tasks that depend on it */
  private reverseDeps: Map<string, string[]> = new Map()

  /** Map of task path to its running ChildProcess */
  private processes: Map<string, ChildProcess> = new Map()

  /** Set of task paths that have been killed */
  private killedPaths: Set<string> = new Set()

  /**
   * Initialize the tracker with all tasks from the verification tree.
   * Also validates for circular dependencies and builds reverse dependency map.
   */
  initialize(nodes: VerificationNode[], parentPath = ""): void {
    for (const node of nodes) {
      const path = parentPath ? `${parentPath}:${node.key}` : node.key
      this.pathToKey.set(path, node.key)
      this.keyToPath.set(node.key, path)

      if (node.reportingDependsOn && node.reportingDependsOn.length > 0) {
        this.dependencies.set(path, node.reportingDependsOn)
      }

      if (node.children) {
        this.initialize(node.children, path)
      }
    }

    // Only validate cycles and build reverse deps once at the root level
    if (parentPath === "") {
      this.validateNoCycles()
      this.buildReverseDeps()
    }
  }

  /**
   * Build reverse dependency map (task → tasks that depend on it)
   */
  private buildReverseDeps(): void {
    for (const [path, deps] of this.dependencies.entries()) {
      for (const dep of deps) {
        const resolvedDep = this.resolveDependency(dep)
        if (resolvedDep) {
          const existing = this.reverseDeps.get(resolvedDep) ?? []
          existing.push(path)
          this.reverseDeps.set(resolvedDep, existing)
        }
      }
    }
  }

  /**
   * Validate that there are no circular dependencies using DFS with coloring.
   * Throws an error with the cycle path if a cycle is detected.
   */
  private validateNoCycles(): void {
    const WHITE = 0 // Not visited
    const GRAY = 1 // Currently visiting (in stack)
    const BLACK = 2 // Fully visited

    const colors = new Map<string, number>()
    const parent = new Map<string, string>()

    // Initialize all nodes as white
    for (const path of this.pathToKey.keys()) {
      colors.set(path, WHITE)
    }

    const dfs = (path: string): string | null => {
      colors.set(path, GRAY)

      const deps = this.dependencies.get(path) ?? []
      for (const dep of deps) {
        const depPath = this.resolveDependency(dep)
        if (!depPath) continue // Unknown dependency, skip

        const color = colors.get(depPath) ?? WHITE

        if (color === GRAY) {
          // Found a cycle - reconstruct the path
          const cycle: string[] = [depPath]
          let current = path
          while (current !== depPath) {
            cycle.unshift(current)
            current = parent.get(current) ?? ""
          }
          cycle.unshift(depPath)
          return cycle.join(" → ")
        }

        if (color === WHITE) {
          parent.set(depPath, path)
          const cyclePath = dfs(depPath)
          if (cyclePath) return cyclePath
        }
      }

      colors.set(path, BLACK)
      return null
    }

    for (const path of this.pathToKey.keys()) {
      if (colors.get(path) === WHITE) {
        const cyclePath = dfs(path)
        if (cyclePath) {
          throw new Error(
            `Circular reporting dependency detected: ${cyclePath}`,
          )
        }
      }
    }
  }

  /**
   * Resolve a dependency identifier to a task path.
   * Tries exact path match first, then key match.
   */
  private resolveDependency(dep: string): string | null {
    // Try exact path match first
    if (this.pathToKey.has(dep)) {
      return dep
    }

    // Try key match
    if (this.keyToPath.has(dep)) {
      return this.keyToPath.get(dep) ?? null
    }

    return null
  }

  /**
   * Record a task result and notify any waiters.
   * If the task failed, kills all dependent processes for early termination.
   */
  recordResult(result: TaskResult): void {
    // Store by path
    this.results.set(result.path, result)

    // If this task failed, kill all dependent processes
    if (!result.ok) {
      this.killDependents(result.path)
    }

    // Notify waiters for this path
    const pathWaiters = this.waiters.get(result.path) ?? []
    for (const waiter of pathWaiters) {
      waiter()
    }
    this.waiters.delete(result.path)

    // Also notify waiters for the key (if different from path)
    const key = result.key
    if (key !== result.path) {
      const keyWaiters = this.waiters.get(key) ?? []
      for (const waiter of keyWaiters) {
        waiter()
      }
      this.waiters.delete(key)
    }
  }

  /**
   * Wait for all dependencies of a task to complete.
   */
  async waitForDependencies(path: string): Promise<void> {
    const deps = this.dependencies.get(path)
    if (!deps || deps.length === 0) {
      return
    }

    const waitPromises = deps.map(dep => this.waitForResult(dep))
    await Promise.all(waitPromises)
  }

  /**
   * Wait for a specific task result to be available.
   */
  private waitForResult(pathOrKey: string): Promise<void> {
    // Check if result already exists
    const resolvedPath = this.resolveDependency(pathOrKey)
    if (resolvedPath && this.results.has(resolvedPath)) {
      return Promise.resolve()
    }

    // Also check by the original identifier
    if (this.results.has(pathOrKey)) {
      return Promise.resolve()
    }

    // Register a waiter
    return new Promise<void>(resolve => {
      const waiters = this.waiters.get(pathOrKey) ?? []
      waiters.push(resolve)
      this.waiters.set(pathOrKey, waiters)
    })
  }

  /**
   * Check if any dependency of a task has failed.
   * Returns the path of the first failed dependency, or null if all passed.
   */
  getFailedDependency(path: string): string | null {
    const deps = this.dependencies.get(path)
    if (!deps || deps.length === 0) {
      return null
    }

    for (const dep of deps) {
      const resolvedPath = this.resolveDependency(dep)
      if (!resolvedPath) continue

      const result = this.results.get(resolvedPath)
      if (result && !result.ok) {
        return resolvedPath
      }
    }

    return null
  }

  /**
   * Check if a task has any reporting dependencies.
   */
  hasDependencies(path: string): boolean {
    const deps = this.dependencies.get(path)
    return deps !== undefined && deps.length > 0
  }

  /**
   * Register a running process for a task.
   */
  registerProcess(path: string, proc: ChildProcess): void {
    this.processes.set(path, proc)
  }

  /**
   * Unregister a process (called when it completes naturally).
   */
  unregisterProcess(path: string): void {
    this.processes.delete(path)
  }

  /**
   * Check if a task was killed.
   */
  wasKilled(path: string): boolean {
    return this.killedPaths.has(path)
  }

  /**
   * Kill all processes that depend on the failed task.
   * Called when a task fails to terminate dependent tasks early.
   */
  killDependents(failedPath: string): void {
    const dependents = this.reverseDeps.get(failedPath) ?? []

    for (const depPath of dependents) {
      const proc = this.processes.get(depPath)
      if (proc?.pid) {
        this.killedPaths.add(depPath)
        // Use tree-kill to kill the process and all its children
        treeKill(proc.pid, "SIGTERM", err => {
          if (err) {
            // Process may have already exited, ignore errors
          }
        })
      }
    }
  }
}

/**
 * Execute a single command and capture output.
 * Optionally registers the process with a tracker for early termination support.
 */
async function executeCommand(
  command: VerificationCommand,
  cwd: string,
  tracker?: ReportingDependencyTracker,
  path?: string,
): Promise<{
  code: number
  output: string
  durationMs: number
  killed: boolean
}> {
  const start = Date.now()

  return new Promise(resolve => {
    const proc = spawn(command.cmd, command.args, {
      shell: process.platform === "win32",
      cwd: command.cwd ?? cwd,
      env: { ...process.env, NO_COLOR: "1", ...command.env },
    })

    // Register process for early termination
    if (tracker && path) {
      tracker.registerProcess(path, proc)
    }

    let output = ""

    proc.stdout.on("data", (data: Buffer) => {
      output += data.toString()
    })

    proc.stderr.on("data", (data: Buffer) => {
      output += data.toString()
    })

    proc.on("close", (code, signal) => {
      // Unregister process
      if (tracker && path) {
        tracker.unregisterProcess(path)
      }

      const durationMs = Date.now() - start
      // Check if process was killed (SIGTERM = 15, exit code 143 = 128 + 15)
      const killed =
        signal === "SIGTERM" ||
        code === 143 ||
        (tracker?.wasKilled(path ?? "") ?? false)

      resolve({
        code: code ?? 1,
        output,
        durationMs,
        killed,
      })
    })

    proc.on("error", err => {
      // Unregister process
      if (tracker && path) {
        tracker.unregisterProcess(path)
      }

      const durationMs = Date.now() - start
      resolve({
        code: 1,
        output: `Failed to execute command: ${err.message}`,
        durationMs,
        killed: false,
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
  private dependencyTracker: ReportingDependencyTracker

  constructor(
    options: VerifyOptions = {},
    registry: ParserRegistry = defaultRegistry,
    callbacks: RunnerCallbacks = {},
  ) {
    this.options = options
    this.registry = registry
    this.callbacks = callbacks
    this.dependencyTracker = new ReportingDependencyTracker()
  }

  /**
   * Run all verification tasks
   */
  async run(tasks: VerificationNode[]): Promise<VerifyResult> {
    const startedAt = new Date().toISOString()
    const wallStart = Date.now()

    // Initialize dependency tracker with all tasks (validates cycles)
    this.dependencyTracker.initialize(tasks)

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

      const allOk = childResults.every(r => r.ok || r.suppressed)

      // Propagate suppressed status from children to parent
      const allSuppressed =
        childResults.length > 0 && childResults.every(r => r.suppressed)
      const anySuppressed = childResults.some(r => r.suppressed)

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

      // If all children are suppressed, parent is also suppressed
      if (allSuppressed) {
        result.suppressed = true
        result.suppressedBy = childResults[0].suppressedBy
      } else if (anySuppressed && !allOk) {
        // Mixed: some suppressed, some failed - don't suppress parent
        // The parent shows as failed with the actual failures visible
      }

      // Record result in tracker before emitting
      this.dependencyTracker.recordResult(result)
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
      this.dependencyTracker.recordResult(result)
      this.callbacks.onTaskComplete?.(result)
      return result
    }

    const command = normalizeCommand(node.run)
    const cwd = this.options.cwd ?? process.cwd()

    // Pass tracker and path for early termination support
    const { code, output, durationMs, killed } = await executeCommand(
      command,
      cwd,
      this.dependencyTracker,
      path,
    )

    const ok = code === 0

    // If process was killed, mark as suppressed immediately
    if (killed) {
      // Wait for dependencies to get the failed dependency path
      await this.dependencyTracker.waitForDependencies(path)
      const failedDep = this.dependencyTracker.getFailedDependency(path)

      const result: TaskResult = {
        key: node.key,
        path,
        ok: false,
        code,
        durationMs,
        output,
        summaryLine: `${node.key}: terminated`,
        suppressed: true,
        suppressedBy: failedDep ?? "unknown",
      }

      this.dependencyTracker.recordResult(result)
      this.callbacks.onTaskComplete?.(result)
      return result
    }

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

    let result: TaskResult = {
      key: node.key,
      path,
      ok,
      code,
      durationMs,
      output,
      summaryLine,
      metrics: parsed.metrics,
    }

    // If this task has reporting dependencies, wait for them and check for suppression
    if (this.dependencyTracker.hasDependencies(path)) {
      await this.dependencyTracker.waitForDependencies(path)

      // Check if any dependency failed - if so, suppress this task's failure
      if (!ok) {
        const failedDep = this.dependencyTracker.getFailedDependency(path)
        if (failedDep) {
          result = {
            ...result,
            suppressed: true,
            suppressedBy: failedDep,
          }
        }
      }
    }

    // Record result in tracker before emitting
    this.dependencyTracker.recordResult(result)
    this.callbacks.onTaskComplete?.(result)
    return result
  }
}
