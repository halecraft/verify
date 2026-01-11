# Plan: @halecraft/verify Package

## Background

The current project has a well-designed verification script at [`scripts/verify.mjs.archived`](../scripts/verify.mjs.archived) that runs multiple verification tasks (format, logic, types) in parallel and provides terse summaries on success with detailed output on failure. This pattern is valuable and should be reusable across multiple Node.js projects.

The script already handles:
- Parallel task execution
- Color-aware TTY output with NO_COLOR support
- JSON mode for machine parsing
- Task-specific output summarizers (e.g., parsing vitest output to show "257/257 tests passed")
- Configurable log verbosity (`--logs=all|failed|none`)

## Problem Statement

The verification logic is currently embedded in a single project. To reuse it:
1. Other projects must copy the script and modify it
2. Output parsers for different tools (vitest, tsc, biome, go test) are hardcoded
3. There's no standard configuration format for defining verification trees
4. Monorepo support (tree of packages, each with verification trees) doesn't exist

## Success Criteria

1. **Reusable Package**: `@halecraft/verify` can be installed as a dev dependency in any Node.js project
2. **Configuration-Driven**: Projects define verifications via `verify.config.ts` with TypeScript support
3. **Pluggable Parsers**: Built-in parsers for common tools; custom parsers can be registered
4. **Hierarchical Trees**: Support nested verification groups (e.g., `logic` containing `ts` and `go`)
5. **Monorepo Support**: Discover and aggregate verifications across multiple packages
6. **Terse Output**: Success shows one-liner summaries; failure shows relevant details
7. **CI-Friendly**: JSON output mode for machine consumption
8. **Zero Config Migration**: This repo can migrate to use the package with minimal changes

## Gap Analysis

| Current State | Target State |
|--------------|--------------|
| Single-file script | Installable npm package |
| Hardcoded task list | Config file (`verify.config.ts`) |
| Inline summarizers | Parser registry with built-in + custom parsers |
| Flat task list | Recursive tree structure |
| Single project | Monorepo discovery and aggregation |
| No workspace setup | `packages/` directory with pnpm workspace |

---

## Milestone 1: Package Scaffolding ✅

Set up the package structure and build configuration.

### Tasks

- ✅ Update `pnpm-workspace.yaml` to include `packages/*`
- ✅ Create `packages/verify/package.json` with name `@halecraft/verify`
- ✅ Create `packages/verify/tsconfig.json` extending root config
- ✅ Create `packages/verify/src/index.ts` with placeholder exports
- ✅ Create `packages/verify/bin/verify.mjs` CLI entry point
- ✅ Add build script using tsup or unbuild for dual CJS/ESM output

---

## Milestone 2: Core Types and Configuration ✅

Define the TypeScript interfaces and configuration schema.

### Tasks

- ✅ Define `VerificationNode` interface (key, name, run, children, strategy, parser)
- ✅ Define `VerificationCommand` interface (cmd, args, cwd)
- ✅ Define `OutputParser` interface (id, parse method)
- ✅ Define `ParsedResult` interface (summary, metrics)
- ✅ Define `VerifyConfig` interface (tasks, packages, options)
- ✅ Implement `defineConfig()` helper function with type inference
- ✅ Implement config file loader (supports `.ts`, `.mjs`, `.js`)

---

## Milestone 3: Parser Registry ✅

Implement the output parser system with built-in parsers.

### Tasks

- ✅ Create `ParserRegistry` class with register/get methods
- ✅ Implement `vitest` parser (extract passed/failed/total/duration)
- ✅ Implement `tsc` parser (count type errors from output)
- ✅ Implement `biome` parser (extract issue count)
- ✅ Implement `gotest` parser (count packages passed/failed)
- ✅ Implement `generic` parser (fallback: exit code only)
- ✅ Add parser auto-detection based on command name

---

## Milestone 4: Verification Runner ✅

Port and enhance the execution engine from `verify.mjs`.

### Tasks

- ✅ Create `VerificationRunner` class
- ✅ Implement single task execution with output capture
- ✅ Implement parallel execution strategy
- ✅ Implement sequential execution strategy
- ✅ Implement fail-fast execution strategy
- ✅ Implement recursive tree traversal for nested verifications
- ✅ Integrate parser registry for output transformation
- ✅ Add timing measurement per task and total

---

## Milestone 5: Reporter System ✅

Implement output formatting for different modes.

### Tasks

- ✅ Create `Reporter` interface with progress/result/summary methods
- ✅ Implement `TTYReporter` with color support and NO_COLOR respect
- ✅ Implement `JSONReporter` for machine-readable output
- ✅ Implement `QuietReporter` for minimal output (summary only)
- ✅ Add log verbosity control (all/failed/none)
- ✅ Implement hierarchical summary formatting for nested trees

---

## Milestone 6: CLI Implementation ✅

Build the command-line interface.

### Tasks

- ✅ Parse CLI arguments (--json, --verbose, --quiet, --filter, --config)
- ✅ Implement config file discovery (verify.config.ts in cwd)
- ✅ Implement task path filtering (e.g., `verify logic:ts`)
- ✅ Wire up runner, parsers, and reporter
- ✅ Handle exit codes correctly (0 = all pass, 1 = any fail)
- ✅ Add --help output

---

## Milestone 7: Monorepo Support ✅

Add package discovery and aggregation for monorepos.

### Tasks

- ✅ Implement `discoverPackages()` function with glob patterns
- ✅ Implement package-level config loading
- 🔴 Implement cross-package aggregation (tree of trees) - deferred
- ✅ Add `--filter` flag for package filtering
- 🔴 Implement monorepo summary formatting - deferred
- 🔴 Add `--changed` flag for git-aware filtering (optional, can defer)

---

## Milestone 8: Migration and Integration ✅

Migrate this repo to use the new package.

### Tasks

- ✅ Create `verify.config.ts` in repo root
- ✅ Update root `package.json` to depend on `@halecraft/verify` (workspace link)
- ✅ Update `verify` script to use `@halecraft/verify` CLI
- ✅ Remove or archive `scripts/verify.mjs`
- ✅ Verify all existing verification commands work correctly
- 🔴 Update `AGENTS.md` documentation - not needed, commands unchanged

---

## Transitive Effect Analysis

### Direct Dependencies

```
@halecraft/verify
├── Node.js child_process (spawn)
├── Node.js fs (config loading)
└── TypeScript (for config files)
```

### Affected Modules in This Repo

1. **`package.json`** - Will add workspace dependency on `@halecraft/verify`
2. **`pnpm-workspace.yaml`** - Must add `packages/*` to workspace config
3. **`scripts/verify.mjs`** - Will be replaced/archived
4. **`AGENTS.md`** - Documentation references `pnpm verify` commands

### Potential Breaking Changes

1. **CI Pipelines** - If any CI config directly calls `scripts/verify.mjs`, it will break
   - Mitigation: Keep `pnpm verify` as the entry point (just changes implementation)

2. **Pre-commit Hooks** - `lint-staged` in `package.json` uses biome directly, not verify
   - No impact expected

3. **Other Projects Using This Pattern** - If other repos copied `verify.mjs`
   - They can migrate to `@halecraft/verify` at their own pace

### Dependency Chain

```
Root package.json
  └── depends on @halecraft/verify (workspace:*)
        └── packages/verify/package.json
              └── devDependencies for build (tsup, typescript)
              └── no runtime dependencies (zero-dep for consumers)
```

### Build Order Considerations

- `@halecraft/verify` must be built before root package can use it
- pnpm workspaces handle this automatically with `workspace:*` protocol
- May need `"preinstall": "pnpm -F @halecraft/verify build"` or similar

---

## File Structure

```
packages/
└── verify/
    ├── package.json          # @halecraft/verify
    ├── tsconfig.json
    ├── tsup.config.ts        # Build config
    ├── bin/
    │   └── verify.mjs        # CLI entry point
    └── src/
        ├── index.ts          # Public API exports
        ├── types.ts          # TypeScript interfaces
        ├── config.ts         # Config loading
        ├── runner.ts         # Execution engine
        ├── reporter.ts       # Output formatting
        ├── discovery.ts      # Monorepo package discovery
        └── parsers/
            ├── index.ts      # Registry
            ├── vitest.ts
            ├── tsc.ts
            ├── biome.ts
            ├── gotest.ts
            └── generic.ts
```
