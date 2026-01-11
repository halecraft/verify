import type { OutputParser, ParsedResult } from "../types.js"

/**
 * Parser for Go test output
 * Counts packages passed/failed from go test output
 */
export const gotestParser: OutputParser = {
  id: "gotest",
  parse(output: string, exitCode: number): ParsedResult | null {
    // Match "ok" and "FAIL" lines for packages
    // ok      github.com/user/pkg    0.123s
    // FAIL    github.com/user/pkg    0.456s
    const okMatches = output.match(/^ok\s+\S+/gm)
    const failMatches = output.match(/^FAIL\s+\S+/gm)

    const passed = okMatches ? okMatches.length : 0
    const failed = failMatches ? failMatches.length : 0
    const total = passed + failed

    if (total === 0) {
      // Try to detect "no test files" case
      if (output.includes("no test files")) {
        return {
          summary: "no test files",
          metrics: { passed: 0, failed: 0, total: 0 },
        }
      }
      return null
    }

    // Extract total duration if present
    // "PASS" or "FAIL" at the end with duration
    const durationMatch = output.match(/(?:PASS|FAIL)\s*$[\s\S]*?(\d+\.?\d*s)/m)
    const duration = durationMatch ? durationMatch[1] : undefined

    if (exitCode === 0) {
      return {
        summary: `${passed} package${passed === 1 ? "" : "s"} passed${duration ? ` in ${duration}` : ""}`,
        metrics: { passed, failed: 0, total: passed, duration },
      }
    }

    return {
      summary: `${failed}/${total} package${total === 1 ? "" : "s"} failed`,
      metrics: { passed, failed, total, duration },
    }
  },
}
