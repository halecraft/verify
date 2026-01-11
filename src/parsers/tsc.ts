import type { OutputParser, ParsedResult } from "../types.js"

/**
 * Parser for TypeScript compiler (tsc) output
 * Counts type errors from output
 */
export const tscParser: OutputParser = {
  id: "tsc",
  parse(output: string, exitCode: number): ParsedResult | null {
    if (exitCode === 0) {
      return {
        summary: "no type errors",
        metrics: { errors: 0 },
      }
    }

    // Count error lines: "src/file.ts(10,5): error TS2345: ..."
    const errorMatches = output.match(/error TS\d+:/g)
    const errorCount = errorMatches ? errorMatches.length : 0

    if (errorCount === 0) {
      // No recognizable errors but still failed
      return null
    }

    return {
      summary: `${errorCount} type error${errorCount === 1 ? "" : "s"}`,
      metrics: { errors: errorCount },
    }
  },
}
