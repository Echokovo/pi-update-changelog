/**
 * On-disk store for the changelogs `/update-changelog-summary` fetches.
 *
 * The model must not re-fetch what the extension already downloaded, so every source is written
 * to a local file and the injected message carries paths instead of truncated text. Files live
 * under the OS temp directory, the same place Pi puts the full text of output it truncates.
 */
import { randomBytes } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

export interface ChangelogSource {
  /** Shown to the model so it can pick the source it needs. */
  label: string;
  /** File name inside the package directory, including the extension. */
  file: string;
  text: string;
}

/** One package with every source the fetchers could produce. */
export interface UpdateSummary {
  displayName: string;
  currentVersion: string;
  latestVersion: string;
  repoUrl?: string | null;
  sources: ChangelogSource[];
}

export interface StoredSource {
  label: string;
  path: string;
  bytes: number;
}

export interface StoredPackage {
  displayName: string;
  currentVersion: string;
  latestVersion: string;
  repoUrl?: string | null;
  sources: StoredSource[];
  /** Explains a package that produced no file, so silence is not read as "nothing changed". */
  note?: string;
}

export interface ChangelogStore {
  dir: string;
  packages: StoredPackage[];
}

/** `@scope/pkg` -> `scope_pkg`, so every package maps to one plain directory name. */
export function changelogDirName(displayName: string): string {
  const cleaned = displayName.replace(/^@/, "").replace(/[^A-Za-z0-9._-]+/g, "_");
  return cleaned.replace(/^[._-]+|[._-]+$/g, "") || "package";
}

/** Package metadata repeated in each file, so a file read on its own still says what it is. */
export function renderSourceFile(summary: UpdateSummary, source: ChangelogSource): string {
  const lines = [
    `# ${summary.displayName} — ${source.label}`,
    `Installed: ${summary.currentVersion} | Latest: ${summary.latestVersion}`,
  ];
  if (summary.repoUrl) lines.push(`Repository: ${summary.repoUrl}`);
  lines.push("", source.text.trimEnd());
  return `${lines.join("\n")}\n`;
}

function createRunId(): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  return `${stamp}-${randomBytes(3).toString("hex")}`;
}

function uniqueDirName(name: string, used: Set<string>): string {
  let candidate = name;
  for (let suffix = 2; used.has(candidate); suffix++) {
    candidate = `${name}-${suffix}`;
  }
  used.add(candidate);
  return candidate;
}

/**
 * Writes one directory per package with one file per source and returns the paths handed to the
 * model. `dir` is only passed by tests; production runs get a fresh timestamped directory.
 */
export async function writeChangelogFiles(summaries: UpdateSummary[], dir?: string): Promise<ChangelogStore> {
  const root = dir ?? join(tmpdir(), "pi", "update-changelog", createRunId());
  // The prompt names this directory even when no package produced a file, so it must exist.
  await mkdir(root, { recursive: true });
  const usedNames = new Set<string>();
  const packages: StoredPackage[] = [];

  for (const summary of summaries) {
    const packageDir = uniqueDirName(changelogDirName(summary.displayName), usedNames);
    const packagePath = join(root, packageDir);
    if (summary.sources.length > 0) await mkdir(packagePath, { recursive: true });

    const sources: StoredSource[] = [];
    for (const source of summary.sources) {
      const path = join(packagePath, source.file);
      const body = renderSourceFile(summary, source);
      await writeFile(path, body, "utf-8");
      sources.push({ label: source.label, path, bytes: Buffer.byteLength(body) });
    }

    packages.push({
      displayName: summary.displayName,
      currentVersion: summary.currentVersion,
      latestVersion: summary.latestVersion,
      repoUrl: summary.repoUrl,
      sources,
      ...(sources.length === 0 ? { note: "No changelog source could be fetched for this package." } : {}),
    });
  }

  return { dir: root, packages };
}
