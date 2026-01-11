import type { OutputParser, ParsedResult } from "../types.js"

/**
 * Strip ANSI escape codes from string
 */
function stripAnsi(str: string): string {
  // biome-ignore lint/suspicious/noControlCharactersInRegex: ANSI escape codes use control characters
  return str.replace(/\x1b\[[0-9;]*m/g, "")
}

/**
 * Parser for vitest output
 * Extracts test counts from vitest summary
 */
export const vitestParser: OutputParser = {
  id: "vitest",
  parse(output: string, exitCode: number): ParsedResult | null {
    // Strip ANSI codes for reliable parsing
    const cleanOutput = stripAnsi(output)

    // Match: "Tests  26 passed (26)" with flexible whitespace
    // Vitest v4 format: "      Tests  26 passed (26)"
    const testsMatch = cleanOutput.match(/Tests\s+(\d+)\s+passed\s*\((\d+)\)/m)

    // Match: "Duration  192ms" or "Duration  1.72s"
    const durationMatch = cleanOutput.match(/Duration\s+([\d.]+(?:ms|s))\b/m)

    if (!testsMatch) {
      return null
    }

    const passed = Number.parseInt(testsMatch[1], 10)
    const total = Number.parseInt(testsMatch[2], 10)
    const duration = durationMatch ? durationMatch[1] : undefined

    // Don't include duration in summary - the reporter adds wall-clock time
    return {
      summary:
        exitCode === 0
          ? `passed ${passed}/${total} tests`
          : `passed ${passed}/${total} tests (some failed)`,
      metrics: {
        passed,
        total,
        failed: total - passed,
        duration,
      },
    }
  },
}
