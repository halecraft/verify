import { defineConfig } from "@halecraft/verify"

export default defineConfig({
  tasks: [
    // Use direct paths to avoid pnpm exec overhead (~150ms per command)
    {
      key: "format",
      run: "./node_modules/.bin/biome check --write .",
      parser: "biome",
    },
    {
      key: "logic",
      run: "./node_modules/.bin/vitest run",
      parser: "vitest",
      reportingDependsOn: ["format"],
    },
    {
      key: "types",
      children: [
        {
          key: "tsc",
          run: "./node_modules/.bin/tsc --noEmit",
          parser: "tsc",
          reportingDependsOn: ["format"],
        },
        {
          key: "tsgo",
          run: "./node_modules/.bin/tsgo --noEmit --diagnostics",
          parser: "tsc",
          reportingDependsOn: ["format"],
        },
      ],
    },
    {
      key: "build",
      run: "./node_modules/.bin/tsup",
      reportingDependsOn: ["format"],
    },
  ],
})
