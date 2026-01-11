import { defineConfig } from "@halecraft/verify"

export default defineConfig({
  tasks: [
    { key: "format", run: "pnpm biome check --write .", parser: "biome" },
    { key: "logic", run: "pnpm vitest run", parser: "vitest" },
    {
      key: "types",
      run: "pnpm exec tsgo --noEmit --diagnostics",
      parser: "tsc",
    },
    { key: "build", run: "pnpm build" },
  ],
})
