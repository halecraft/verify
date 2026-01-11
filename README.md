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
  run?: string | { cmd: string; args: string[]; cwd?: string };

  // Child tasks (for grouping)
  children?: VerificationNode[];

  // Execution strategy for children: 'parallel' | 'sequential' | 'fail-fast'
  strategy?: ExecutionStrategy;

  // Parser ID for output parsing (auto-detected if not specified)
  parser?: string;
}
```

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
});

const result = await verify(config, {
  logs: "failed",
  format: "human",
});

console.log(result.ok ? "All passed!" : "Some failed");
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
