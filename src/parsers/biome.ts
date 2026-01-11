import type { OutputParser, ParsedResult } from "../types.js"

/**
 * Parser for Biome linter/formatter output
 * Extracts issue counts from biome check output
 */
export const biomeParser: OutputParser = {
  id: "biome",
  parse(output: string, exitCode: number): ParsedResult | null {
    if (exitCode === 0) {
      return {
        summary: "no issues",
        metrics: { errors: 0, warnings: 0 },
      }
    }

    // Biome outputs something like "Found 5 errors and 2 warnings"
    // or individual diagnostics
    const summaryMatch = output.match(
      /Found\s+(\d+)\s+error(?:s)?\s+(?:and\s+(\d+)\s+warning(?:s)?)?/i,
    )

    if (summaryMatch) {
      const errors = Number.parseInt(summaryMatch[1], 10)
      const warnings = summaryMatch[2]
        ? Number.parseInt(summaryMatch[2], 10)
        : 0

      return {
        summary: `${errors} error${errors === 1 ? "" : "s"}${warnings > 0 ? `, ${warnings} warning${warnings === 1 ? "" : "s"}` : ""}`,
        metrics: { errors, warnings },
      }
    }

    // Count individual error markers if no summary found
    // Biome uses "error" prefix for diagnostics
    const errorLines = output.match(/^\s*error\[/gm)
    const warningLines = output.match(/^\s*warning\[/gm)

    const errors = errorLines ? errorLines.length : 0
    const warnings = warningLines ? warningLines.length : 0

    if (errors > 0 || warnings > 0) {
      return {
        summary: `${errors} error${errors === 1 ? "" : "s"}${warnings > 0 ? `, ${warnings} warning${warnings === 1 ? "" : "s"}` : ""}`,
        metrics: { errors, warnings },
      }
    }

    return null
  },
}
