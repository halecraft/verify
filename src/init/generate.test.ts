import { describe, expect, it } from "vitest"
import type { DetectedTask } from "./detect.js"
import {
  generateConfigContent,
  getDefaultConfigPath,
  getOutputFormat,
} from "./generate.js"

describe("generate", () => {
  describe("getOutputFormat", () => {
    it("returns ts for .ts files", () => {
      expect(getOutputFormat("verify.config.ts")).toBe("ts")
    })

    it("returns mts for .mts files", () => {
      expect(getOutputFormat("verify.config.mts")).toBe("mts")
    })

    it("returns js for .js files", () => {
      expect(getOutputFormat("verify.config.js")).toBe("js")
    })

    it("returns mjs for .mjs files", () => {
      expect(getOutputFormat("verify.config.mjs")).toBe("mjs")
    })

    it("defaults to ts for unknown extensions", () => {
      expect(getOutputFormat("verify.config")).toBe("ts")
      expect(getOutputFormat("config.json")).toBe("ts")
    })
  })

  describe("getDefaultConfigPath", () => {
    it("returns verify.config.ts", () => {
      expect(getDefaultConfigPath()).toBe("verify.config.ts")
    })
  })

  describe("generateConfigContent", () => {
    it("generates skeleton when no tasks provided", () => {
      const content = generateConfigContent([], "ts")
      expect(content).toContain('import { defineConfig } from "@halecraft/verify"')
      expect(content).toContain("export default defineConfig({")
      expect(content).toContain("tasks: [")
      expect(content).toContain("// Add your verification tasks here")
    })

    it("generates config with single task", () => {
      const tasks: DetectedTask[] = [
        {
          key: "test",
          name: "Tests",
          scriptName: "test",
          command: "pnpm test",
          category: "logic",
        },
      ]
      const content = generateConfigContent(tasks, "ts")
      expect(content).toContain('import { defineConfig } from "@halecraft/verify"')
      expect(content).toContain('{ key: "test", run: "pnpm test" }')
    })

    it("generates config with multiple tasks", () => {
      const tasks: DetectedTask[] = [
        {
          key: "format",
          name: "Format",
          scriptName: "lint",
          command: "pnpm lint",
          category: "format",
        },
        {
          key: "test",
          name: "Tests",
          scriptName: "test",
          command: "pnpm test",
          category: "logic",
        },
      ]
      const content = generateConfigContent(tasks, "ts")
      expect(content).toContain('{ key: "format", run: "pnpm lint" }')
      expect(content).toContain('{ key: "test", run: "pnpm test" }')
    })

    it("uses same import syntax for all formats", () => {
      const tasks: DetectedTask[] = [
        {
          key: "test",
          name: "Tests",
          scriptName: "test",
          command: "npm run test",
          category: "logic",
        },
      ]

      for (const format of ["ts", "mts", "js", "mjs"] as const) {
        const content = generateConfigContent(tasks, format)
        expect(content).toContain('import { defineConfig } from "@halecraft/verify"')
      }
    })

    it("produces valid JavaScript syntax", () => {
      const tasks: DetectedTask[] = [
        {
          key: "build",
          name: "Build",
          scriptName: "build",
          command: "pnpm build",
          category: "build",
        },
      ]
      const content = generateConfigContent(tasks, "ts")

      // Should be parseable (basic syntax check)
      expect(content).toMatch(/^import .+ from .+$/m)
      expect(content).toMatch(/export default defineConfig\(\{/)
      expect(content).toMatch(/tasks: \[/)
      expect(content).toMatch(/\}\)\n$/) // Ends with })\n
    })
  })
})
