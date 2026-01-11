# @halecraft/verify

Quickly check if your nodejs project is in an OK state.

Or, more technically--`verify` is a hierarchical verification runner with parallel execution and terse output.

## Installation

```bash
pnpm add -D @halecraft/verify
# or
npm install -D @halecraft/verify
# or
yarn add -D @halecraft/verify
```

## Quick Start

### Initialize a Config

The easiest way to get started is to use the `--init` flag:

```bash
# Interactive mode - select which tasks to include
npx @halecraft/verify --init
```

The init command will:

1. Scan your `package.json` for verification-related scripts (lint, test, typecheck, build, etc.)
2. Present an interactive checkbox UI to select which tasks to include
3. Generate a `verify.config.ts` file with your selections

### Manual Configuration

Create a `verify.config.ts` file in your project root:

```typescript
import { defineConfig } from "@halecraft/verify";

export default defineConfig({
  tasks: [
    { key: "format", run: "pnpm lint" },
    { key: "types", run: "pnpm typecheck" },
    { key: "test", run: "pnpm test" },
  ],
});
```

Note that you can shave off ~150ms for each command if you skip your package manager (e.g. `./node_modules/.bin/eslint` instead of `pnpm lint`).

### Run Verification

```bash
# Run all tasks
pnpm exec verify

# Run specific task
pnpm exec verify format

# Run with verbose output
pnpm exec verify --verbose

# Output JSON (for CI)
pnpm exec verify --json
```

Or you can add `"verify": "verify"` to package.json scripts and run:

```bash
# Run all tasks
pnpm verify
```

## Configuration

### Task Definition

Each task in verify.config.ts can have the following properties:

```typescript
interface VerificationNode {
  // Unique key for this task (used in CLI filtering)
  key: string;

  // Human-readable name (optional)
  name?: string;

  // Command to run (leaf nodes only)
  // Supports: string, object with cmd/args/cwd, or [cmd, args] tuple
  run?:
    | string
    | { cmd: string; args: string[]; cwd?: string }
    | [string, string[]];

  // Child tasks (for grouping)
  children?: VerificationNode[];

  // Execution strategy for children: 'parallel' | 'sequential' | 'fail-fast'
  strategy?: ExecutionStrategy;

  // Parser ID for output parsing (auto-detected if not specified)
  parser?: string;

  // Tasks that must pass for this task's failure to be reported
  reportingDependsOn?: string[];

  // Custom success message template (optional)
  successLabel?: string;

  // Custom failure message template (optional)
  failureLabel?: string;
}
```

### Smart Output Suppression with `reportingDependsOn`

When a syntax error occurs, multiple tools often report the same underlying issue (Biome, tsc, esbuild all complaining about the same missing comma). The `reportingDependsOn` option reduces this noise by suppressing redundant failure output.

```typescript
import { defineConfig } from "@halecraft/verify";

export default defineConfig({
  tasks: [
    { key: "format", run: "biome check ." },
    { key: "types", run: "tsc --noEmit", reportingDependsOn: ["format"] },
    { key: "logic", run: "vitest run", reportingDependsOn: ["format"] },
    { key: "build", run: "tsup", reportingDependsOn: ["format"] },
  ],
});
```

**How it works:**

- All tasks still execute in parallel (no speed regression)
- When a dependency fails (e.g., `format`), dependent tasks are terminated early for faster feedback
- Dependent tasks that also fail are marked as "suppressed"
- Only the root cause failure shows detailed logs
- Suppressed tasks show `⊘ suppressed` instead of `✗ failed`

**Before (noisy):**

```
✗ format (syntax error at line 14)
✗ types (syntax error at line 14)
✗ logic (syntax error at line 14)
✗ build (syntax error at line 14)

==== FORMAT FAIL ====
[50 lines of biome output]

==== TYPES FAIL ====
[20 lines of tsc output]

==== LOGIC FAIL ====
[30 lines of vitest output]

==== BUILD FAIL ====
[30 lines of tsup output]
```

**After (clean):**

```
✗ format (syntax error at line 14)
⊘ types (suppressed - format failed)
⊘ logic (suppressed - format failed)
⊘ build (suppressed - format failed)

==== FORMAT FAIL ====
[50 lines of biome output]

== verification: Failed ==
```

**Note:** When using `verify --init`, the generated config automatically adds `reportingDependsOn: ["format"]` to types, logic, and build tasks when a format task is detected.

### Nested Tasks

Group related tasks together:

```typescript
import { defineConfig } from "@halecraft/verify";

export default defineConfig({
  tasks: [
    { key: "format", run: "pnpm lint" },
    { key: "types", run: "pnpm typecheck" },
    {
      key: "logic",
      children: [
        { key: "unit", run: "vitest run" },
        { key: "e2e", run: "playwright test" },
      ],
    },
  ],
});
```

Run nested tasks with colon notation:

```bash
npx verify logic:unit
```

### Execution Strategies

Control how child tasks are executed:

```typescript
{
  key: 'tests',
  strategy: 'fail-fast', // Stop on first failure
  children: [
    { key: 'unit', run: 'vitest run' },
    { key: 'integration', run: 'pnpm test:integration' },
  ],
}
```

- `parallel` (default): Run all tasks simultaneously
- `sequential`: Run tasks one after another
- `fail-fast`: Run sequentially, stop on first failure

## CLI Options

```
Usage:
  verify [options] [filter...]

Options:
  --json              Output results as JSON
  --verbose, -v       Show all task output
  --quiet, -q         Show only final result
  --top-level, -t     Show only top-level tasks (hide descendants)
  --no-tty            Force sequential output (disable live dashboard)
  --logs=MODE         Log verbosity: all, failed, none (default: failed)
  --config, -c PATH   Path to config file (or output path for --init)
  --filter, -f PATH   Filter to specific task paths
  --init              Initialize a new verify.config.ts file
  --force             Overwrite existing config file (with --init)
  --yes, -y           Skip interactive prompts, auto-accept detected tasks
  --help, -h          Show this help message
```

## Programmatic API

```typescript
import { verify, defineConfig } from "@halecraft/verify";

const config = defineConfig({
  tasks: [{ key: "test", run: "vitest run" }],
  // Optional: set default options for this config
  options: {
    logs: "failed",
  },
});

const result = await verify(config, {
  // All options (CLI options can override config defaults)
  logs: "failed", // "all" | "failed" | "none"
  format: "human", // "human" | "json"
  filter: ["test"], // Filter to specific task paths
  cwd: process.cwd(), // Working directory
  noColor: false, // Disable colors
  topLevelOnly: false, // Show only top-level tasks
  noTty: false, // Force sequential output
});

console.log(result.ok ? "All passed!" : "Some failed");
```

### VerifyResult

The `verify()` function returns a `VerifyResult` object:

```typescript
interface VerifyResult {
  ok: boolean; // Whether all tasks passed
  startedAt: string; // ISO timestamp when run started
  finishedAt: string; // ISO timestamp when run finished
  durationMs: number; // Total duration in milliseconds
  tasks: TaskResult[]; // Individual task results
}

interface TaskResult {
  key: string; // Task key
  path: string; // Full path (e.g., "logic:unit")
  ok: boolean; // Whether the task passed
  code: number; // Exit code
  durationMs: number; // Duration in milliseconds
  output: string; // Raw output
  summaryLine: string; // Parsed summary
  suppressed?: boolean; // True if output was suppressed
  suppressedBy?: string; // Path of dependency that caused suppression
  children?: TaskResult[]; // Child results (for group nodes)
}
```

## Output Parsers

Built-in parsers for common tools:

- **vitest** - Vitest test runner
- **tsc** - TypeScript compiler
- **biome** - Biome linter/formatter
- **gotest** - Go test runner
- **generic** - Fallback for unknown tools

Parsers automatically extract metrics (passed/failed counts, duration) and provide concise summaries.

## License

MIT
