import { existsSync, readdirSync, statSync } from "node:fs"
import { join, relative } from "node:path"
import { findConfigFile, loadConfig } from "./config.js"
import type { PackageDiscoveryOptions, VerifyConfig } from "./types.js"

/**
 * Discovered package with its config
 */
export interface DiscoveredPackage {
  /** Package name from package.json */
  name: string
  /** Relative path from root */
  path: string
  /** Absolute path */
  absolutePath: string
  /** Loaded verify config (if exists) */
  config: VerifyConfig | null
}

/**
 * Default glob patterns for package discovery
 */
const DEFAULT_PATTERNS = ["packages/*", "apps/*"]

/**
 * Find directories matching patterns
 */
function findMatchingDirs(rootDir: string, patterns: string[]): string[] {
  const results: string[] = []

  for (const pattern of patterns) {
    // Handle simple patterns like "packages/*"
    if (pattern.endsWith("/*")) {
      const parentDir = pattern.slice(0, -2)
      const parentPath = join(rootDir, parentDir)

      if (existsSync(parentPath) && statSync(parentPath).isDirectory()) {
        const entries = readdirSync(parentPath)
        for (const entry of entries) {
          const entryPath = join(parentPath, entry)
          if (statSync(entryPath).isDirectory()) {
            results.push(entryPath)
          }
        }
      }
    } else {
      // Direct path
      const dirPath = join(rootDir, pattern)
      if (existsSync(dirPath) && statSync(dirPath).isDirectory()) {
        results.push(dirPath)
      }
    }
  }

  return results
}

/**
 * Read package name from package.json
 */
function getPackageName(packageDir: string): string | null {
  const packageJsonPath = join(packageDir, "package.json")
  if (!existsSync(packageJsonPath)) {
    return null
  }

  try {
    const content = require(packageJsonPath) as { name?: string }
    return content.name ?? null
  } catch {
    return null
  }
}

/**
 * Discover packages in a monorepo
 */
export async function discoverPackages(
  rootDir: string,
  options: PackageDiscoveryOptions = {},
): Promise<DiscoveredPackage[]> {
  const patterns = options.patterns ?? DEFAULT_PATTERNS
  const matchingDirs = findMatchingDirs(rootDir, patterns)

  const packages: DiscoveredPackage[] = []

  for (const dir of matchingDirs) {
    const name = getPackageName(dir)
    if (!name) continue // Skip directories without package.json

    // Check filter
    if (options.filter && options.filter.length > 0) {
      const matches = options.filter.some(
        f =>
          name === f || name.includes(f) || relative(rootDir, dir).includes(f),
      )
      if (!matches) continue
    }

    // Try to load verify config
    const configPath = findConfigFile(dir)
    const config = configPath ? await loadConfig(configPath) : null

    packages.push({
      name,
      path: relative(rootDir, dir),
      absolutePath: dir,
      config,
    })
  }

  return packages
}

/**
 * Check if a package has changed (git-aware)
 * This is a placeholder - full implementation would use git diff
 */
export async function hasPackageChanged(
  _packagePath: string,
  _baseBranch = "main",
): Promise<boolean> {
  // TODO: Implement git-aware change detection
  // For now, always return true (include all packages)
  return true
}
