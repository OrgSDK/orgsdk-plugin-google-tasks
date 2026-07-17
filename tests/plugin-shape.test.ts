/**
 * Plugin shape / contract tests.
 *
 * Imports the real entry through Bun's module system (no daemon, no DB) and
 * exercises the factory with a no-op PluginContext — mirrors the monorepo's
 * tests/plugins approach. These are the implementation-equivalence tests: they
 * pin the exact eleven function names/count, the `google-oauth` credential
 * requirement on every function, the readonly/write split with the discovery
 * subset, and the deliberate ABSENCE of an authProvider (google-tasks is
 * functions-only — google-sheets owns the shared google-oauth connect flow).
 *
 * Behavioral parity with monorepo `packages/plugins/src/google-tasks` v1.0.1:
 *  - task lists (3): listTaskLists, createTaskList, deleteTaskList
 *  - tasks (8): listTasks, getTask, createTask, updateTask, completeTask,
 *    uncompleteTask, deleteTask, clearCompletedTasks
 *  - requiredCredentials: ["google-oauth"] on every function
 *  - NO authProvider (functions-only), no config, no httpEndpoints
 */
import { describe, expect, it } from "bun:test";
import type { PluginContext, PluginModule } from "@orgsdk/plugins";

const EXPECTED_FUNCTIONS = [
	// task lists (3)
	"listTaskLists",
	"createTaskList",
	"deleteTaskList",
	// tasks (8)
	"listTasks",
	"getTask",
	"createTask",
	"updateTask",
	"completeTask",
	"uncompleteTask",
	"deleteTask",
	"clearCompletedTasks",
] as const;

// Functions tagged readonly in the monorepo source (metadata.readonly === true
// AND tags include "readonly"). The remaining eight are write/mutating.
const READONLY_FUNCTIONS = ["listTaskLists", "listTasks", "getTask"] as const;

// Functions tagged discovery (metadata.discovery === true AND tags include
// "discovery"). Both are readonly list operations.
const DISCOVERY_FUNCTIONS = ["listTaskLists", "listTasks"] as const;

const noopCtx: PluginContext = {
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

async function loadPlugin(ctx: PluginContext = noopCtx): Promise<PluginModule> {
	const mod = await import("../plugin/index");
	const factory = mod.default as (ctx: PluginContext) => PluginModule;
	return factory(ctx);
}

describe("plugin shape", () => {
	it("factory returns a module with safeFunctions", async () => {
		const mod = await loadPlugin();
		expect(Array.isArray(mod.safeFunctions)).toBe(true);
		expect(mod.safeFunctions?.length).toBeGreaterThan(0);
	});

	it("exposes exactly the eleven expected safe functions (no more, no less)", async () => {
		const mod = await loadPlugin();
		const names = (mod.safeFunctions ?? []).map((f) => f.name).sort();
		expect(names).toEqual([...EXPECTED_FUNCTIONS].sort());
		expect((mod.safeFunctions ?? []).length).toBe(11);
	});

	it('every function declares requiredCredentials: ["google-oauth"]', async () => {
		const mod = await loadPlugin();
		const fns = mod.safeFunctions ?? [];
		for (const fn of fns) {
			expect(fn.requiredCredentials).toEqual(["google-oauth"]);
		}
	});

	it("every function is categorized under google", async () => {
		const mod = await loadPlugin();
		for (const fn of mod.safeFunctions ?? []) {
			expect(fn.metadata?.category).toBe("google");
		}
	});

	it("every function is tagged auth (all require the google-oauth credential)", async () => {
		const mod = await loadPlugin();
		for (const fn of mod.safeFunctions ?? []) {
			expect(fn.metadata?.tags).toContain("auth");
		}
	});

	it("every function name is unique within the plugin", async () => {
		const mod = await loadPlugin();
		const names = (mod.safeFunctions ?? []).map((f) => f.name);
		expect(new Set(names).size).toBe(names.length);
	});

	it("exactly the three readonly functions carry readonly flag + tag", async () => {
		const mod = await loadPlugin();
		const fns = mod.safeFunctions ?? [];
		const readonlyFns = fns.filter((f) => f.metadata?.readonly === true);
		expect(readonlyFns.length).toBe(READONLY_FUNCTIONS.length);
		const names = new Set(readonlyFns.map((f) => f.name));
		for (const expected of READONLY_FUNCTIONS) {
			expect(names.has(expected)).toBe(true);
		}
		for (const fn of readonlyFns) {
			expect(fn.metadata?.tags).toContain("readonly");
		}
	});

	it("the eight write functions do NOT carry readonly (mutating)", async () => {
		const mod = await loadPlugin();
		const fns = mod.safeFunctions ?? [];
		const writeFns = fns.filter((f) => f.metadata?.readonly !== true);
		expect(writeFns.length).toBe(8);
		// The write set is the complement of the readonly set.
		const readonlySet = new Set<string>(READONLY_FUNCTIONS);
		for (const fn of writeFns) {
			expect(readonlySet.has(fn.name)).toBe(false);
		}
		// Sanity: readonly ∪ write === all 11.
		expect(writeFns.length + READONLY_FUNCTIONS.length).toBe(11);
	});

	it("exactly the two discovery functions carry discovery flag + tag", async () => {
		const mod = await loadPlugin();
		const byName = new Map((mod.safeFunctions ?? []).map((f) => [f.name, f]));
		for (const name of DISCOVERY_FUNCTIONS) {
			const fn = byName.get(name);
			expect(fn?.metadata?.discovery).toBe(true);
			expect(fn?.metadata?.tags).toContain("discovery");
		}
		// Every discovery function must also be readonly (no write is discovery).
		for (const name of DISCOVERY_FUNCTIONS) {
			expect(
				READONLY_FUNCTIONS.includes(
					name as (typeof READONLY_FUNCTIONS)[number],
				),
			).toBe(true);
		}
		// No non-discovery-listed function carries the discovery flag.
		const discoveryFlagged = (mod.safeFunctions ?? []).filter(
			(f) => f.metadata?.discovery === true,
		);
		expect(discoveryFlagged.length).toBe(DISCOVERY_FUNCTIONS.length);
	});

	// ── The coordinated-train contract: google-tasks is functions-only ──────
	// It intentionally has NO authProvider. google-sheets owns the shared
	// google-oauth connect flow (one-click first-party OR BYO); google-tasks
	// only consumes the resulting credential. Asserting absence here guards
	// against accidentally introducing a second OAuth connect owner, which
	// would create a duplicate connect round-trip for tenants.
	it("has NO authProvider (functions-only; google-sheets owns connect)", async () => {
		const mod = await loadPlugin();
		expect(mod.authProvider).toBeUndefined();
	});

	it("has no config (no Zod schema, no tenant_config)", async () => {
		const mod = await loadPlugin();
		expect(mod.config).toBeUndefined();
	});

	it("has no httpEndpoints (functions-only plugin, no callback flow)", async () => {
		const mod = await loadPlugin();
		expect(mod.httpEndpoints ?? []).toEqual([]);
	});

	it("onLoad tolerates a missing google-oauth credential (warns, no throw)", async () => {
		const mod = await loadPlugin();
		// Returns void; must not reject. The noopCtx credential.get → null.
		await expect(mod.onLoad?.(noopCtx)).resolves.toBeUndefined();
	});
});
