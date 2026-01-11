import type { OutputParser, ParsedResult } from "../types.js"

/**
 * Parser for vitest output
 * Extracts test counts and duration from vitest summary
 */
export const vitestParser: OutputParser = {
  id: "vitest",
  parse(output: string, exitCode: number): ParsedResult | null {
    // Match: "Tests  257 passed (257)" with flexible whitespace
    const testsMatch = output.match(/^\s*Tests\s+(\d+)\s+passed\s+\((\d+)\)/m)

    // Match: "Duration  1.72s" and ignore extra timing breakdown
    const durationMatch = output.match(/^\s*Duration\s+([\d.]+s)\b/m)

    if (!testsMatch || !durationMatch) {
      return null
    }

    const passed = Number.parseInt(testsMatch[1], 10)
    const total = Number.parseInt(testsMatch[2], 10)
    const duration = durationMatch[1]

    return {
      summary:
        exitCode === 0
          ? `${passed}/${total} tests passed in ${duration}`
          : `${passed}/${total} tests passed (some failed)`,
      metrics: {
        passed,
        total,
        failed: total - passed,
        duration,
      },
    }
  },
}
