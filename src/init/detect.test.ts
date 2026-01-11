import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import {
  detectFromPackageJson,
  detectPackageManager,
  detectTasks,
  getRunCommand,
} from "./detect.js"

describe("detect", () => {
  const testDir = join(process.cwd(), ".test-detect")

  beforeEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true })
    }
    mkdirSync(testDir, { recursive: true })
  })

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true })
    }
  })

  describe("detectFromPackageJson", () => {
    it("returns empty array when no package.json exists", () => {
      const result = detectFromPackageJson(testDir)
      expect(result).toEqual([])
    })

    it("returns empty array when package.json has no scripts", () => {
      writeFileSync(
        join(testDir, "package.json"),
        JSON.stringify({ name: "test" }),
      )
      const result = detectFromPackageJson(testDir)
      expect(result).toEqual([])
    })

    it("detects lint script", () => {
      writeFileSync(
        join(testDir, "package.json"),
        JSON.stringify({
          name: "test",
          scripts: { lint: "eslint ." },
        }),
      )
      const result = detectFromPackageJson(testDir)
      expect(result).toHaveLength(1)
      expect(result[0]).toMatchObject({
        key: "format",
        category: "format",
        scriptName: "lint",
      })
    })

    it("detects test script", () => {
      writeFileSync(
        join(testDir, "package.json"),
        JSON.stringify({
          name: "test",
          scripts: { test: "vitest run" },
        }),
      )
      const result = detectFromPackageJson(testDir)
      expect(result).toHaveLength(1)
      expect(result[0]).toMatchObject({
        key: "test",
        category: "logic",
        scriptName: "test",
      })
    })

    it("detects typecheck script", () => {
      writeFileSync(
        join(testDir, "package.json"),
        JSON.stringify({
          name: "test",
          scripts: { typecheck: "tsc --noEmit" },
        }),
      )
      const result = detectFromPackageJson(testDir)
      expect(result).toHaveLength(1)
      expect(result[0]).toMatchObject({
        key: "types",
        category: "types",
        scriptName: "typecheck",
      })
    })

    it("detects build script", () => {
      writeFileSync(
        join(testDir, "package.json"),
        JSON.stringify({
          name: "test",
          scripts: { build: "tsup" },
        }),
      )
      const result = detectFromPackageJson(testDir)
      expect(result).toHaveLength(1)
      expect(result[0]).toMatchObject({
        key: "build",
        category: "build",
        scriptName: "build",
      })
    })

    it("detects multiple scripts and sorts by category", () => {
      writeFileSync(
        join(testDir, "package.json"),
        JSON.stringify({
          name: "test",
          scripts: {
            build: "tsup",
            test: "vitest",
            lint: "eslint .",
            typecheck: "tsc",
          },
        }),
      )
      const result = detectFromPackageJson(testDir)
      expect(result).toHaveLength(4)
      // Should be sorted: format -> types -> logic -> build
      expect(result[0].category).toBe("format")
      expect(result[1].category).toBe("types")
      expect(result[2].category).toBe("logic")
      expect(result[3].category).toBe("build")
    })

    it("skips npm-run-all scripts", () => {
      writeFileSync(
        join(testDir, "package.json"),
        JSON.stringify({
          name: "test",
          scripts: {
            verify: "run-s lint test",
            lint: "eslint .",
          },
        }),
      )
      const result = detectFromPackageJson(testDir)
      expect(result).toHaveLength(1)
      expect(result[0].scriptName).toBe("lint")
    })
  })

  describe("detectPackageManager", () => {
    it("detects pnpm from lock file", () => {
      writeFileSync(join(testDir, "pnpm-lock.yaml"), "")
      expect(detectPackageManager(testDir)).toBe("pnpm")
    })

    it("detects yarn from lock file", () => {
      writeFileSync(join(testDir, "yarn.lock"), "")
      expect(detectPackageManager(testDir)).toBe("yarn")
    })

    it("defaults to npm when no lock file", () => {
      expect(detectPackageManager(testDir)).toBe("npm")
    })
  })

  describe("getRunCommand", () => {
    it("returns pnpm command", () => {
      expect(getRunCommand("pnpm", "test")).toBe("pnpm test")
    })

    it("returns yarn command", () => {
      expect(getRunCommand("yarn", "test")).toBe("yarn test")
    })

    it("returns npm run command", () => {
      expect(getRunCommand("npm", "test")).toBe("npm run test")
    })
  })

  describe("detectTasks", () => {
    it("uses detected package manager for commands", () => {
      writeFileSync(join(testDir, "pnpm-lock.yaml"), "")
      writeFileSync(
        join(testDir, "package.json"),
        JSON.stringify({
          name: "test",
          scripts: { test: "vitest" },
        }),
      )
      const result = detectTasks(testDir)
      expect(result[0].command).toBe("pnpm test")
    })
  })
})
