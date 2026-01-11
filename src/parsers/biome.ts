import type { OutputParser, ParsedResult } from "../types.js"

/**
 * Parser for Biome linter/formatter output
 * Extracts issue counts and file counts from biome check output
 */
export const biomeParser: OutputParser = {
  id: "biome",
  parse(output: string, exitCode: number): ParsedResult | null {
    // Extract file count from "Checked N files in Xms"
    const filesMatch = output.match(
      /Checked\s+(\d+)\s+files?\s+in\s+[\d.]+(?:ms|s)/i,
    )
    const fileCount = filesMatch
      ? Number.parseInt(filesMatch[1], 10)
      : undefined

    // Check for warnings in output like "Found 1 warning."
    const warningMatch = output.match(/Found\s+(\d+)\s+warning/i)
    const warnings = warningMatch ? Number.parseInt(warningMatch[1], 10) : 0

    if (exitCode === 0) {
      const filesPart = fileCount ? `passed ${fileCount} files` : "passed"
      const warningSuffix =
        warnings > 0 ? `, ${warnings} warning${warnings === 1 ? "" : "s"}` : ""
      return {
        summary: `${filesPart}${warningSuffix}`,
        metrics: { errors: 0, warnings, total: fileCount },
      }
    }

    // Biome outputs something like "Found 5 errors and 2 warnings"
    // or individual diagnostics
    const summaryMatch = output.match(
      /Found\s+(\d+)\s+error(?:s)?(?:\s+and\s+(\d+)\s+warning(?:s)?)?/i,
    )

    if (summaryMatch) {
      const errors = Number.parseInt(summaryMatch[1], 10)
      const parsedWarnings = summaryMatch[2]
        ? Number.parseInt(summaryMatch[2], 10)
        : warnings

      const fileSuffix = fileCount ? ` in ${fileCount} files` : ""
      return {
        summary: `${errors} error${errors === 1 ? "" : "s"}${parsedWarnings > 0 ? `, ${parsedWarnings} warning${parsedWarnings === 1 ? "" : "s"}` : ""}${fileSuffix}`,
        metrics: { errors, warnings: parsedWarnings, total: fileCount },
      }
    }

    // Count individual error markers if no summary found
    // Biome uses "error" prefix for diagnostics
    const errorLines = output.match(/^\s*error\[/gm)
    const warningLines = output.match(/^\s*warning\[/gm)

    const errors = errorLines ? errorLines.length : 0
    const countedWarnings = warningLines ? warningLines.length : warnings

    if (errors > 0 || countedWarnings > 0) {
      const fileSuffix = fileCount ? ` in ${fileCount} files` : ""
      return {
        summary: `${errors} error${errors === 1 ? "" : "s"}${countedWarnings > 0 ? `, ${countedWarnings} warning${countedWarnings === 1 ? "" : "s"}` : ""}${fileSuffix}`,
        metrics: { errors, warnings: countedWarnings, total: fileCount },
      }
    }

    // No errors found but still have file count
    if (fileCount) {
      return {
        summary: `passed ${fileCount} files`,
        metrics: { errors: 0, warnings: 0, total: fileCount },
      }
    }

    return null
  },
}
