# Contract migration — completed

## Status: consuming `@orgsdk/plugins` from npm

This plugin imports its authoring types from the public
[`@orgsdk/plugins`](https://www.npmjs.com/package/@orgsdk/plugins) npm package.
The migration from the monorepo workspace specifier is complete.

## What changed (from the monorepo source)

1. **Import specifiers updated** — `from "orgsdk/plugins"` →
   `from "@orgsdk/plugins"`. All imports are **type-only**
   (`import type { … }`), erased at compile time.
2. **devDependency** is the published npm package, pinned to an exact version
   (`@orgsdk/plugins@0.2.1`) for reproducibility.
3. **Purity guards** — type-only imports from `@orgsdk/plugins` are
   allowed; value imports and all other `@orgsdk/*` packages are blocked
   (enforced by `tests/purity.test.ts` and `orgsdk-plugin validate`).
4. **Artifact runtime dependencies — `@googleapis/tasks` + `google-auth-library`.**
   `google-tasks-functions.ts` imports `{ tasks_v1 }` from `@googleapis/tasks`
   at runtime and constructs a `tasks_v1.Tasks` client; `oauth.ts` imports
   `{ OAuth2Client }` from `google-auth-library` and builds the OAuth2 client
   from the shared `google-oauth` bundle. Both are declared as runtime
   `dependencies` entries, so the generated artifact `package.json` carries
   `"dependencies": { "@googleapis/tasks": "^12.0.0", "google-auth-library": "^10.6.2" }`
   and the platform's `resolvePluginDeps` bundles the full closure into
   `__bundle.js` at publish time (the daemon imports the bundle directly — no
   runtime node_modules resolution). The authoring SDK (`@orgsdk/plugins`) is
   **not** a runtime dependency (type-only imports are erased at compile time).
5. **Manifest `$schema`** — `plugin/.plugin.json` declares
   `$schema: https://orgsdk.ai/schemas/plugin-manifest.v1.json` for editor
   completion and schema validation.
6. **Manifest `entry`** — declared as `index.ts` (explicit, not defaulted).
7. **Provenance** — `marketplace.links.sourceRepo` points at this repository
   (canonical key supported by `plugin-manifest.v1`). The upstream Google APIs
   are documented in the README; the `homepage` (support.google.com/tasks) and
   `docs` (developers.google.com/tasks/reference/rest) user-facing links are
   preserved verbatim.
8. **No local management scripts** — `validate`, `package`, `version-guard`,
   and `publish` are npm scripts that delegate to the `orgsdk-plugin` CLI
   shipped by `@orgsdk/plugins`.
9. **Reusable CI/CD workflows** — `.github/workflows/ci.yml` and
   `publish-catalog.yml` call the centrally maintained reusable workflows in
   `OrgSDK/plugins` (pinned to an immutable commit) instead of duplicating
   CI/publish mechanics.

## What did NOT change (frozen behavior)

- All eleven safe functions — names, parameters, return types, metadata, tags,
  the readonly/write split (three readonly, eight write), and the two discovery
  flags.
- The shared `google-oauth` contract: **no authProvider** (functions-only),
  `requiredCredentials: ["google-oauth"]` on every function, no OAuth callback.
  google-sheets remains the sole connect owner of the shared credential.
- The `source: "first-party" | "byo"` discriminator in `oauth.ts` and the
  relay-refresh semantics in `first-party-client.ts` — first-party bundles
  refresh via the relay (no local client secret); BYO bundles refresh locally.
  `oauth.ts` + `first-party-client.ts` are byte-identical self-contained
  duplicates of the google-sheets leaf modules.
- No `config` (no Zod schema), no `httpEndpoints`, no `tables`.
- The factory `PluginModule` entry shape (`default export` →
  `(ctx) => PluginModule`) — not a static `safeFunctions` export.
- The `@googleapis/tasks` and `google-auth-library` usage — byte-identical.
- `plugin/docs/overview.md` and `plugin/guides/usage-patterns.md` — verbatim.

## Install-resolution correction (zero runtime change)

`googleapis-common@^8.0.0` (a direct dependency of `@googleapis/tasks@12.0.0`)
pins `google-auth-library` to an **exact** `10.5.0`, while this plugin declares
`google-auth-library@^10.6.2` (resolves to `10.9.0`). An unconstrained install
therefore produces **two copies** of `google-auth-library` (the nested `10.5.0`
under `googleapis-common` and the top-level `10.9.0`). At runtime this is
harmless — JavaScript duck-typing means `new tasks_v1.Tasks({ auth })` works
regardless of which copy the `OAuth2Client` came from — but TypeScript rejects
it as a type-identity mismatch ("Types have separate declarations of a private
property 'redirectUri'").

The correction is a repo-local `overrides` entry in `package.json`:

```json
"overrides": { "google-auth-library": "10.9.0" }
```

This forces Bun to install a **single** `google-auth-library@10.9.0`, so both
`oauth.ts` and the `tasks_v1.Tasks` constructor resolve the same `OAuth2Client`
type. `10.9.0` is within the same major (`10.x`) as googleapis-common's pinned
`10.5.0` — backward compatible.

**This does not change the published artifact.** The generated artifact
`package.json` carries only the `dependencies` block
(`@googleapis/tasks ^12.0.0`, `google-auth-library ^10.6.2`) — the `overrides`
field is repo-local and does not flow into the staged artifact (verified by
`tests/packaging.test.ts`, which asserts the artifact `dependencies` keys
exactly equal the two runtime packages and that no `overrides` leaks). At
publish time, `resolvePluginDeps` installs from the artifact ranges (no
override) and may again produce two copies — `Bun.build` inlines both into
`__bundle.js`, which loads and runs identically. `tests/google-bundle.test.ts`
stages the ranges WITHOUT the override and proves the bundle still loads and
materializes all eleven functions.

This is the same category as the github migration's "type-only corrections
necessary for tsc, zero runtime change" — a compile/install-time convenience
that leaves runtime behavior and the artifact contract byte-identical.

## Complete dependency-closure determination

The `google-tasks` plugin's runtime dependency closure (required for
server-side bundling via `resolvePluginDeps`):

| Package | Role | Bundled? |
|---|---|---|
| `@googleapis/tasks@^12.0.0` | direct runtime import (`tasks_v1` in google-tasks-functions.ts) | yes — inlined into `__bundle.js` |
| `google-auth-library@^10.6.2` | direct runtime import (`OAuth2Client` in oauth.ts) | yes — inlined |
| `googleapis-common@^8.0.0` | transitive of @googleapis/tasks | yes — inlined |
| `gaxios`, `https-proxy-agent`, `agent-base`, `jws`, `jsrsasign`, `googleads-info`, … | transitive of google-auth-library / googleapis-common | yes — inlined |
| `zod` | present in the daemon image | external (resolved at runtime, not bundled) |
| `@orgsdk/plugins` | authoring SDK, type-only imports | erased (not in runtime closure) |

`@googleapis/tasks@^12.0.0` resolves to `12.0.0` and `google-auth-library@^10.6.2`
resolves to `10.9.0` — the source-declared supported ranges. There is no
root/latest drift; the artifact pins the source ranges, not newer majors.

`Bun.build` (target: `bun`, format: `esm`, `external: ["zod"]`) produces a
deterministic single-file bundle. The daemon imports it directly — no
`node_modules`, no native binary. Verified by `tests/google-bundle.test.ts`.

### Server-process assumptions

- **Publish time:** `resolvePluginDeps` needs network access to resolve both
  Google packages from npm into a temp staging dir, then `Bun.build`. No native
  compilation step (pure JS).
- **Daemon runtime:** the standard daemon container image suffices. No system
  packages, no native addons. The Tasks client makes outbound HTTPS to
  `www.googleapis.com` at call time (gated by the connected credential's
  scopes). First-party credentials additionally call the relay's
  `/api/oauth/refresh` near token expiry (the relay holds OrgSDK's client
  secret); BYO credentials refresh locally.

> **Stop condition satisfied.** The user asked to "stop if bundle/load fails."
> The full Google dependency closure bundles cleanly into a single ESM file,
> loads, and the factory materializes all eleven safe functions with no
> authProvider present — all with no network calls. The gate passes; no issue
> is hidden.

## Known pre-existing issues (recorded, not fixed in this release)

These predate the extraction and are frozen byte-for-byte per the migration
discipline (skill learning #6 — never combine a behavioral refactor with an
extraction):

### Security / resource concerns (frozen)

- **Arbitrary outbound Google Tasks API calls.** Every handler issues an
  authenticated request to `www.googleapis.com`. The scope of what an agent can
  do is bounded only by the connected credential's scopes. There is no
  per-call allow/deny list, no rate-limit guard, and no response-size cap.
- **Destructive operations.** `deleteTaskList`, `deleteTask`, and
  `clearCompletedTasks` are irreversible. No confirmation gate exists at the
  plugin layer.
- **`updateTask` / `completeTask` / `uncompleteTask` fetch-then-merge.** These
  read the current task then spread updates over it — a read-modify-write that
  can clobber a concurrent edit. This is the Google Tasks API's own (lack of)
  ETag behavior, surfaced verbatim.
- **Module-level access-token cache in `first-party-client.ts`.**
  `accessTokenCache` is a process-global keyed by refresh token. It is not
  scoped per-tenant or per-agent. In the daemon's shared-process model this is
  acceptable because credentials are resolved per-call, but it means a cached
  token could persist across a token rotation within the same process lifetime.

### Code-quality concerns (frozen)

- **`google-tasks-functions.ts` exceeds the 300-line guideline** (554 lines).
  This is a pre-existing monorepo file-size violation (G5). It is frozen in
  this extraction; a split into per-group modules is a separate, later release.
- **Pre-existing `as` casts** in several handlers (e.g.
  `t.status as "needsAction" | "completed"`). These narrow the Google API's
  union-typed responses. They were not introduced by the migration and are
  frozen.
- **Pre-existing non-null assertions** (`resp.data.id!`, `tl.id!`, `t.id!`).
  Biome flags these as `lint/style/noNonNullAssertion` (8 occurrences, all
  warnings, non-blocking exit 0). They are frozen — removing them would be a
  behavioral change to the mapper return shapes.
- **`createTasksClient` reads `credentials["google-oauth"]` via an `as` cast**
  (`creds["google-oauth"] as GoogleOAuthBundle | undefined`). Frozen.

### Self-contained leaf-module duplication (frozen, by design)

`oauth.ts` and `first-party-client.ts` are byte-identical copies of the
google-sheets plugin's leaf modules. The source NOTE documents why: cloud-mode
plugins must be self-contained because the materialiser's path-traversal guard
blocks cross-plugin sibling imports. The two copies must be kept in sync
manually. This is an accepted architectural constraint, not a defect to fix in
this extraction.

## Why `@orgsdk/plugins`?

The package provides the stable, minimal, structural TypeScript contract
between plugin authors and the OrgSDK daemon — with no private daemon,
platform, storage, or database internals. See
[OrgSDK/plugins](https://github.com/OrgSDK/plugins) for the full API surface.

## Type-only contract

All imports from `@orgsdk/plugins` are `import type { … }` — erased at compile
time. The runtime plugin artifact carries **only** `@googleapis/tasks` and
`google-auth-library` as dependencies. This means:

- Minimal runtime weight (two framework dependencies, whose full closure is
  bundled at publish time).
- Plugin source typechecks against the same contract the daemon enforces.

## Upgrading the contract version

The dependency is pinned exactly (`0.2.1`). When a new contract version is
released, update the version in `package.json`, regenerate the lockfile with
`bun install`, and confirm tests still pass. Prefer deliberate, reviewed
upgrades over floating ranges while the contract is still pre-1.0.
