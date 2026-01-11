import type { ParsedResult } from "../types.js"

/**
 * Generic fallback parser - just reports exit code
 * This parser always returns a result (never null)
 */
export const genericParser = {
  id: "generic",
  parse(_output: string, exitCode: number): ParsedResult {
    return {
      summary: exitCode === 0 ? "passed" : `failed (exit code ${exitCode})`,
    }
  },
} as const
