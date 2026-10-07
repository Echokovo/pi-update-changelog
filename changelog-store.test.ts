import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { changelogDirName, renderSourceFile, writeChangelogFiles, type UpdateSummary } from "./changelog-store.ts";

async function withTempDir(run: (dir: string) => Promise<void>): Promise<void> {
	const dir = await mkdtemp(join(tmpdir(), "update-changelog-store-"));
	try {
		await run(dir);
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
}

function summary(overrides: Partial<UpdateSummary> = {}): UpdateSummary {
	return { displayName: "pkg", currentVersion: "1.0.0", latestVersion: "2.0.0", sources: [], ...overrides };
}

test("maps a package name to a plain directory name", () => {
	assert.equal(changelogDirName("@scope/pkg"), "scope_pkg");
	assert.equal(changelogDirName("pi-task-ui"), "pi-task-ui");
	assert.equal(changelogDirName("weird name!"), "weird_name");
	assert.equal(changelogDirName("@"), "package");
});

test("repeats package metadata in each source file", () => {
	const text = renderSourceFile(
		summary({ displayName: "a", repoUrl: "https://github.com/x/y" }),
		{ label: "GitHub releases", file: "releases.md", text: "### 2.0.0\n- change\n" },
	);

	assert.ok(
		text.startsWith(
			"# a — GitHub releases\nInstalled: 1.0.0 | Latest: 2.0.0\nRepository: https://github.com/x/y\n\n### 2.0.0\n- change\n",
		),
	);
});

test("writes one file per source and reports the bytes on disk", async () => {
	await withTempDir(async (dir) => {
		const store = await writeChangelogFiles(
			[
				summary({
					displayName: "@scope/pkg",
					sources: [
						{ label: "GitHub releases", file: "releases.md", text: "release body" },
						{ label: "CHANGELOG.md", file: "changelog.md", text: "changelog body" },
					],
				}),
			],
			dir,
		);

		const stored = store.packages[0];
		assert.equal(stored.note, undefined);
		assert.deepEqual(stored.sources.map((source) => source.label), ["GitHub releases", "CHANGELOG.md"]);
		assert.match(stored.sources[0].path, /scope_pkg\/releases\.md$/);

		for (const source of stored.sources) {
			const onDisk = await readFile(source.path, "utf-8");
			assert.equal(Buffer.byteLength(onDisk), source.bytes);
			assert.ok(onDisk.includes(source.label), "each file carries its own label");
		}
	});
});

test("keeps a package without sources fileless and says why", async () => {
	await withTempDir(async (dir) => {
		const store = await writeChangelogFiles([summary()], dir);

		assert.equal(store.packages[0].sources.length, 0);
		assert.match(store.packages[0].note ?? "", /No changelog source could be fetched/);
		assert.ok((await stat(store.dir)).isDirectory(), "the directory named in the prompt must exist");
	});
});

test("keeps directory names distinct when package names collide", async () => {
	await withTempDir(async (dir) => {
		const store = await writeChangelogFiles(
			[
				summary({ displayName: "a/b", sources: [{ label: "L", file: "x.md", text: "first" }] }),
				summary({ displayName: "a_b", sources: [{ label: "L", file: "x.md", text: "second" }] }),
			],
			dir,
		);

		const [first, second] = store.packages;
		assert.notEqual(first.sources[0].path, second.sources[0].path);
		assert.ok(second.sources[0].path.includes("/a_b-2/"));
		assert.match(await readFile(second.sources[0].path, "utf-8"), /second/);
	});
});
