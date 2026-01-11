import { defineConfig } from "@halecraft/verify"

export default defineConfig({
  tasks: [
    // Use direct paths to avoid pnpm exec overhead (~250ms per command)
    {
      key: "format",
      run: "./node_modules/.bin/biome check --write .",
      parser: "biome",
    },
    { key: "logic", run: "./node_modules/.bin/vitest run", parser: "vitest" },
    {
      key: "types",
      children: [
        { key: "tsc", run: "./node_modules/.bin/tsc --noEmit", parser: "tsc" },
        {
          key: "tsgo",
          run: "./node_modules/.bin/tsgo --noEmit --diagnostics",
          parser: "tsc",
        },
      ],
    },
    // build still uses pnpm because it runs the package.json script
    { key: "build", run: "./node_modules/.bin/tsup" },
  ],
})
