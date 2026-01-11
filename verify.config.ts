import { defineConfig } from "@halecraft/verify"

export default defineConfig({
  tasks: [
    { key: "format", run: "pnpm verify:format" },
    { key: "logic", run: "pnpm verify:logic" },
    { key: "types", run: "pnpm verify:types" },
    { key: "build", run: "pnpm build" },
  ],
})
