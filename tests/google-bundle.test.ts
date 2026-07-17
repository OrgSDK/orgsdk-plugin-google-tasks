/**
 * Isolated materialize/load smoke — the dependency-bundling gate.
 *
 * This simulates the daemon-side bundling flow (packages/platform/src/plugins/
 * resolve-deps.ts) that runs at publish time:
 *
 *   stage source + declared deps → bun install → Bun.build → __bundle.js
 *
 * The daemon imports __bundle.js directly at runtime — there is no node_modules
 * resolution in the tenant container. So this test proves the FULL closure of
 * the `google-tasks` plugin (@googleapis/tasks + google-auth-library + their
 * transitive deps, e.g. googleapis-common, gaxios, https-proxy-agent, jws, …)
 * bundles into a single ESM file, loads, and materializes all eleven safe
 * functions.
 *
 * No network calls are made: the factory + onLoad are exercised, but the
 * safe-function handlers (which call the Tasks API) are never invoked. onLoad
 * calls the credential store (returns null → a warning is logged) and returns.
 *
 * If @googleapis/tasks or google-auth-library ever fail to bundle or load here
 * (e.g. a future version hard-requires a native binary or dynamic import that
 * Bun.build can't inline), this test BLOCKS rather than hiding the issue, per
 * the migration discipline.
 *
 * Modeled on tests/octokit-bundle.test.ts in orgsdk-plugin-github.
 */
import { describe, expect, it } from "bun:test";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { $ } from "bun";

const ROOT = resolve(import.meta.dir, "..");
const PLUGIN_DIR = join(ROOT, "plugin");

/** All eleven google-tasks safe-function names, sorted. */
const EXPECTED_FUNCTION_NAMES = [
	"clearCompletedTasks",
	"completeTask",
	"createTask",
	"createTaskList",
	"deleteTask",
	"deleteTaskList",
	"getTask",
	"listTaskLists",
	"listTasks",
	"uncompleteTask",
	"updateTask",
] as const;

// A no-op PluginContext sufficient to construct the factory + onLoad without a
// daemon or DB. No handler is invoked, so no credential resolution or network
// access occurs.
const noopCtx = {
	stores: {
		credential: {
			get: async () => null,
			list: async () => [],
			upsert: async () => {},
			delete: async () => {},
			getSecrets: async () => null,
			setSecrets: async () => {},
		},
		config: {
			list: async () => [],
			get: async () => null,
			set: async () => ({ key: "", value: {}, updatedAt: null }),
			delete: async () => {},
		},
	},
	publicBaseUrl: "http://localhost:3000",
	logger: {
		trace() {},
		debug() {},
		info() {},
		warn() {},
		error() {},
		fatal() {},
		child() {
			return this;
		},
	},
};

interface MaterializedModule {
	safeFunctions: Array<{ name: string; requiredCredentials?: string[] }>;
	authProvider: unknown;
	onLoad?: () => Promise<void>;
}

interface StagedBundle {
	bundlePath: string;
	stagingDir: string;
}

async function stagePluginBundle(): Promise<StagedBundle> {
	const stagingDir = await mkdtemp(
		join(tmpdir(), "orgsdk-google-tasks-smoke-"),
	);
	// Copy plugin source (everything under plugin/ except manifest/package.json
	// — those are regenerated for the staging dir, mirroring resolvePluginDeps).
	const entries = await readdir(PLUGIN_DIR, { withFileTypes: true });
	for (const entry of entries) {
		if (entry.name === ".plugin.json") continue;
		const src = join(PLUGIN_DIR, entry.name);
		const dest = join(stagingDir, entry.name);
		if (entry.isDirectory()) {
			await $`cp -r ${src} ${dest}`.quiet();
		} else {
			await $`cp ${src} ${dest}`.quiet();
		}
	}
	// Declare ONLY the two Google runtime packages — this mirrors the published
	// artifact package.json exactly (the source-declared supported ranges).
	await writeFile(
		join(stagingDir, "package.json"),
		JSON.stringify(
			{
				private: true,
				dependencies: {
					"@googleapis/tasks": "^12.0.0",
					"google-auth-library": "^10.6.2",
				},
			},
			null,
			2,
		),
	);
	// Resolve both Google packages (and their full transitive closure) into the
	// staging dir's own node_modules.
	await $`bun install`.cwd(stagingDir).quiet();
	// Bundle with the same config as resolvePluginDeps (target bun, esm,
	// zod external — zod is present in the daemon image).
	const result = await Bun.build({
		entrypoints: [join(stagingDir, "index.ts")],
		outdir: stagingDir,
		target: "bun",
		format: "esm",
		external: ["zod"],
	});
	if (!result.success || result.outputs.length === 0) {
		throw new Error(`Bun.build failed: ${result.logs.map(String).join("; ")}`);
	}
	return { bundlePath: result.outputs[0].path, stagingDir };
}

async function loadBundleModule(
	bundlePath: string,
): Promise<MaterializedModule> {
	const mod = (await import(bundlePath)) as {
		default: (ctx: typeof noopCtx) => MaterializedModule;
	};
	const factory = mod.default;
	if (typeof factory !== "function") {
		throw new Error("bundle default export is not a factory function");
	}
	return factory(noopCtx);
}

describe("isolated materialize/load smoke (resolvePluginDeps simulation)", () => {
	let loaded: StagedBundle;

	it("bundles the full Google dependency closure into a single ESM file", async () => {
		const out = await stagePluginBundle();
		loaded = out;
		const bytes = await readFile(out.bundlePath, "utf-8");
		// @googleapis/tasks + google-auth-library + their transitive closure
		// (googleapis-common, gaxios, https-proxy-agent, jws, …) is a large body
		// of code. Bun.build tree-shakes aggressively but the closure still
		// exceeds 100KB (typically several hundred KB inlined).
		expect(bytes.length).toBeGreaterThan(100_000);
		// No bare `from "@googleapis/tasks"`, `from "google-auth-library"`, or
		// any `@googleapis/*` should remain — the entire closure must be
		// inlined, not left as an external import.
		expect(bytes).not.toMatch(/^\s*import.*from\s+["']@googleapis\/tasks["']/m);
		expect(bytes).not.toMatch(
			/^\s*import.*from\s+["']google-auth-library["']/m,
		);
		expect(bytes).not.toMatch(
			/^\s*import.*from\s+["']@googleapis\/[^"']*["']/m,
		);
	});

	it("the bundle loads and the factory exposes all eleven safe functions", async () => {
		const mod = await loadBundleModule(loaded.bundlePath);
		expect(Array.isArray(mod.safeFunctions)).toBe(true);
		expect(mod.safeFunctions.length).toBe(11);
		expect(mod.safeFunctions.map((f) => f.name).sort()).toEqual(
			[...EXPECTED_FUNCTION_NAMES].sort(),
		);
	});

	it("every bundled function requires the google-oauth credential", async () => {
		const mod = await loadBundleModule(loaded.bundlePath);
		for (const fn of mod.safeFunctions) {
			expect(fn.requiredCredentials).toEqual(["google-oauth"]);
		}
	});

	it("the bundle carries NO authProvider (functions-only; google-sheets owns connect)", async () => {
		const mod = await loadBundleModule(loaded.bundlePath);
		expect(mod.authProvider).toBeUndefined();
	});

	it("onLoad runs without a credential and without a network call", async () => {
		const mod = await loadBundleModule(loaded.bundlePath);
		await expect(mod.onLoad?.()).resolves.toBeUndefined();
	});

	it("re-bundling is byte-deterministic (same source → same output modulo path)", async () => {
		const firstBytes = await readFile(loaded.bundlePath, "utf-8");
		const second = await stagePluginBundle();
		const secondBytes = await readFile(second.bundlePath, "utf-8");
		// Normalize the staging path (resolvePluginDeps does the same) then
		// compare — the only allowed difference is the embedded temp path. Bun
		// also mangles the entry-path basename into internal identifiers, so
		// normalize both forms.
		const norm = (s: string, dir: string) => {
			const base = dir.split("/").pop() ?? dir;
			return s
				.replaceAll(dir, "/plugin-bundle-root")
				.replaceAll(base, "plugin-bundle-root")
				.replaceAll(base.replaceAll("-", "_"), "plugin_bundle_root");
		};
		expect(norm(secondBytes, second.stagingDir)).toBe(
			norm(firstBytes, loaded.stagingDir),
		);
		await rm(second.stagingDir, { recursive: true, force: true });
	});

	// Cleanup after the whole describe block (bun:test runs these sequentially).
	it("cleans up the staging dir", async () => {
		await rm(loaded.stagingDir, { recursive: true, force: true });
		expect(loaded.stagingDir).toBeDefined();
	});
});
