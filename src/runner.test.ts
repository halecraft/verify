import { describe, expect, it } from "vitest"
import { ReportingDependencyTracker } from "./runner.js"
import type { TaskResult, VerificationNode } from "./types.js"

describe("ReportingDependencyTracker", () => {
  describe("initialize", () => {
    it("collects all task paths and keys", () => {
      const tracker = new ReportingDependencyTracker()
      const nodes: VerificationNode[] = [
        { key: "format", run: "biome check ." },
        { key: "types", run: "tsc --noEmit", reportingDependsOn: ["format"] },
      ]

      tracker.initialize(nodes)

      // Should be able to wait for dependencies without error
      expect(tracker.hasDependencies("types")).toBe(true)
      expect(tracker.hasDependencies("format")).toBe(false)
    })

    it("handles nested nodes", () => {
      const tracker = new ReportingDependencyTracker()
      const nodes: VerificationNode[] = [
        { key: "format", run: "biome check ." },
        {
          key: "types",
          children: [
            {
              key: "tsc",
              run: "tsc --noEmit",
              reportingDependsOn: ["format"],
            },
            {
              key: "tsgo",
              run: "tsgo --noEmit",
              reportingDependsOn: ["format"],
            },
          ],
        },
      ]

      tracker.initialize(nodes)

      expect(tracker.hasDependencies("types:tsc")).toBe(true)
      expect(tracker.hasDependencies("types:tsgo")).toBe(true)
      expect(tracker.hasDependencies("types")).toBe(false)
    })

    it("throws on circular dependencies", () => {
      const tracker = new ReportingDependencyTracker()
      const nodes: VerificationNode[] = [
        { key: "a", run: "echo a", reportingDependsOn: ["b"] },
        { key: "b", run: "echo b", reportingDependsOn: ["a"] },
      ]

      expect(() => tracker.initialize(nodes)).toThrow(
        /Circular reporting dependency detected/,
      )
    })

    it("throws on self-referential dependency", () => {
      const tracker = new ReportingDependencyTracker()
      const nodes: VerificationNode[] = [
        { key: "a", run: "echo a", reportingDependsOn: ["a"] },
      ]

      expect(() => tracker.initialize(nodes)).toThrow(
        /Circular reporting dependency detected/,
      )
    })

    it("throws on transitive circular dependencies", () => {
      const tracker = new ReportingDependencyTracker()
      const nodes: VerificationNode[] = [
        { key: "a", run: "echo a", reportingDependsOn: ["c"] },
        { key: "b", run: "echo b", reportingDependsOn: ["a"] },
        { key: "c", run: "echo c", reportingDependsOn: ["b"] },
      ]

      expect(() => tracker.initialize(nodes)).toThrow(
        /Circular reporting dependency detected/,
      )
    })
  })

  describe("recordResult and getFailedDependency", () => {
    it("returns null when no dependencies", () => {
      const tracker = new ReportingDependencyTracker()
      const nodes: VerificationNode[] = [
        { key: "format", run: "biome check ." },
      ]

      tracker.initialize(nodes)

      const result: TaskResult = {
        key: "format",
        path: "format",
        ok: false,
        code: 1,
        durationMs: 100,
        output: "error",
        summaryLine: "format: failed",
      }

      tracker.recordResult(result)

      expect(tracker.getFailedDependency("format")).toBe(null)
    })

    it("returns failed dependency path", () => {
      const tracker = new ReportingDependencyTracker()
      const nodes: VerificationNode[] = [
        { key: "format", run: "biome check ." },
        { key: "types", run: "tsc --noEmit", reportingDependsOn: ["format"] },
      ]

      tracker.initialize(nodes)

      const formatResult: TaskResult = {
        key: "format",
        path: "format",
        ok: false,
        code: 1,
        durationMs: 100,
        output: "error",
        summaryLine: "format: failed",
      }

      tracker.recordResult(formatResult)

      expect(tracker.getFailedDependency("types")).toBe("format")
    })

    it("returns null when dependency passed", () => {
      const tracker = new ReportingDependencyTracker()
      const nodes: VerificationNode[] = [
        { key: "format", run: "biome check ." },
        { key: "types", run: "tsc --noEmit", reportingDependsOn: ["format"] },
      ]

      tracker.initialize(nodes)

      const formatResult: TaskResult = {
        key: "format",
        path: "format",
        ok: true,
        code: 0,
        durationMs: 100,
        output: "",
        summaryLine: "format: passed",
      }

      tracker.recordResult(formatResult)

      expect(tracker.getFailedDependency("types")).toBe(null)
    })

    it("supports key-based dependency matching", () => {
      const tracker = new ReportingDependencyTracker()
      const nodes: VerificationNode[] = [
        { key: "format", run: "biome check ." },
        { key: "types", run: "tsc --noEmit", reportingDependsOn: ["format"] },
      ]

      tracker.initialize(nodes)

      const formatResult: TaskResult = {
        key: "format",
        path: "format",
        ok: false,
        code: 1,
        durationMs: 100,
        output: "error",
        summaryLine: "format: failed",
      }

      tracker.recordResult(formatResult)

      // "types" depends on "format" by key, should find the failed dependency
      expect(tracker.getFailedDependency("types")).toBe("format")
    })

    it("supports path-based dependency matching", () => {
      const tracker = new ReportingDependencyTracker()
      const nodes: VerificationNode[] = [
        {
          key: "types",
          children: [
            { key: "tsc", run: "tsc --noEmit" },
            { key: "tsgo", run: "tsgo --noEmit" },
          ],
        },
        {
          key: "build",
          run: "tsup",
          reportingDependsOn: ["types:tsc"],
        },
      ]

      tracker.initialize(nodes)

      const tscResult: TaskResult = {
        key: "tsc",
        path: "types:tsc",
        ok: false,
        code: 1,
        durationMs: 100,
        output: "error",
        summaryLine: "tsc: failed",
      }

      tracker.recordResult(tscResult)

      // "build" depends on "types:tsc" by path
      expect(tracker.getFailedDependency("build")).toBe("types:tsc")
    })
  })

  describe("waitForDependencies", () => {
    it("resolves immediately when no dependencies", async () => {
      const tracker = new ReportingDependencyTracker()
      const nodes: VerificationNode[] = [
        { key: "format", run: "biome check ." },
      ]

      tracker.initialize(nodes)

      // Should resolve immediately
      await tracker.waitForDependencies("format")
    })

    it("resolves immediately when dependency result already recorded", async () => {
      const tracker = new ReportingDependencyTracker()
      const nodes: VerificationNode[] = [
        { key: "format", run: "biome check ." },
        { key: "types", run: "tsc --noEmit", reportingDependsOn: ["format"] },
      ]

      tracker.initialize(nodes)

      const formatResult: TaskResult = {
        key: "format",
        path: "format",
        ok: true,
        code: 0,
        durationMs: 100,
        output: "",
        summaryLine: "format: passed",
      }

      tracker.recordResult(formatResult)

      // Should resolve immediately since format result is already recorded
      await tracker.waitForDependencies("types")
    })

    it("waits for dependency result to be recorded", async () => {
      const tracker = new ReportingDependencyTracker()
      const nodes: VerificationNode[] = [
        { key: "format", run: "biome check ." },
        { key: "types", run: "tsc --noEmit", reportingDependsOn: ["format"] },
      ]

      tracker.initialize(nodes)

      let resolved = false
      const waitPromise = tracker.waitForDependencies("types").then(() => {
        resolved = true
      })

      // Should not be resolved yet
      await new Promise(r => setTimeout(r, 10))
      expect(resolved).toBe(false)

      // Record the result
      const formatResult: TaskResult = {
        key: "format",
        path: "format",
        ok: true,
        code: 0,
        durationMs: 100,
        output: "",
        summaryLine: "format: passed",
      }

      tracker.recordResult(formatResult)

      // Now it should resolve
      await waitPromise
      expect(resolved).toBe(true)
    })
  })
})
