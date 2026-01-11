import type { OutputParser, ParsedResult } from "../types.js"

/**
 * Parser for TypeScript compiler (tsc/tsgo) output
 * Counts type errors and extracts diagnostics info
 */
export const tscParser: OutputParser = {
  id: "tsc",
  parse(output: string, exitCode: number): ParsedResult | null {
    // Extract file count from diagnostics output: "Files:             277"
    const filesMatch = output.match(/^Files:\s+(\d+)/m)
    const fileCount = filesMatch
      ? Number.parseInt(filesMatch[1], 10)
      : undefined

    if (exitCode === 0) {
      const filesPart = fileCount ? `passed ${fileCount} files` : "passed"
      return {
        summary: filesPart,
        metrics: { errors: 0, total: fileCount },
      }
    }

    // Count error lines: "src/file.ts(10,5): error TS2345: ..."
    const errorMatches = output.match(/error TS\d+:/g)
    const errorCount = errorMatches ? errorMatches.length : 0

    if (errorCount === 0) {
      // No recognizable errors but still failed
      return null
    }

    const fileSuffix = fileCount ? ` in ${fileCount} files` : ""
    return {
      summary: `${errorCount} type error${errorCount === 1 ? "" : "s"}${fileSuffix}`,
      metrics: { errors: errorCount, total: fileCount },
    }
  },
}
