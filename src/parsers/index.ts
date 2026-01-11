import type { OutputParser, ParsedResult } from "../types.js"
import { biomeParser } from "./biome.js"
import { genericParser } from "./generic.js"
import { gotestParser } from "./gotest.js"
import { tscParser } from "./tsc.js"
import { vitestParser } from "./vitest.js"

/**
 * Registry for output parsers
 */
export class ParserRegistry {
  private parsers = new Map<string, OutputParser>()

  constructor() {
    // Register built-in parsers
    this.register(genericParser)
    this.register(vitestParser)
    this.register(tscParser)
    this.register(biomeParser)
    this.register(gotestParser)
  }

  /**
   * Register a custom parser
   */
  register(parser: OutputParser): void {
    this.parsers.set(parser.id, parser)
  }

  /**
   * Get a parser by ID
   */
  get(id: string): OutputParser | undefined {
    return this.parsers.get(id)
  }

  /**
   * Auto-detect parser based on command
   */
  detectParser(cmd: string): string {
    const cmdLower = cmd.toLowerCase()

    if (cmdLower.includes("vitest") || cmdLower.includes("jest")) {
      return "vitest"
    }
    if (cmdLower.includes("tsc") || cmdLower.includes("tsgo")) {
      return "tsc"
    }
    if (cmdLower.includes("biome") || cmdLower.includes("eslint")) {
      return "biome"
    }
    if (
      cmdLower.includes("go test") ||
      (cmdLower.includes("go") && cmdLower.includes("test"))
    ) {
      return "gotest"
    }

    return "generic"
  }

  /**
   * Parse output using the specified or auto-detected parser
   */
  parse(
    output: string,
    exitCode: number,
    parserId?: string,
    cmd?: string,
  ): ParsedResult {
    const id = parserId ?? (cmd ? this.detectParser(cmd) : "generic")
    const parser = this.parsers.get(id) ?? genericParser

    const result = parser.parse(output, exitCode)
    if (result) {
      return result
    }

    // Fallback to generic if parser returns null
    // genericParser.parse always returns a result, never null
    const fallback = genericParser.parse(output, exitCode)
    if (!fallback) {
      throw new Error("genericParser unexpectedly returned null")
    }
    return fallback
  }
}

// Default registry instance
export const defaultRegistry = new ParserRegistry()

// Re-export individual parsers
export { biomeParser } from "./biome.js"
export { genericParser } from "./generic.js"
export { gotestParser } from "./gotest.js"
export { tscParser } from "./tsc.js"
export { vitestParser } from "./vitest.js"
