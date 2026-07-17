# Changelog

All notable releases of `@orgsdk/plugin-google-tasks` are documented here.

The catalog treats versions as **write-once**: a given `(slug, version)` may be
re-published only with identical artifact content; differing content is
rejected with HTTP 409. Every entry below is therefore forward-only.

## [1.0.2] — standalone repository extraction

A forward-only patch release that migrates the `google-tasks` plugin from the
OrgSDK monorepo (`packages/plugins/src/google-tasks/`) into this standalone
repository. **No plugin source behavior changed** — the eleven safe functions,
the shared `google-oauth` credential contract (functions-only, no authProvider),
the `source` first-party/BYO discriminator and relay-refresh semantics, the
factory entry shape, and the `@googleapis/tasks` + `google-auth-library`
runtime dependencies are byte-identical to the monorepo `1.0.1`.

### Why 1.0.2 (not 1.0.1)

The repository/package/schema additions alter the immutable publishable content
of the staged artifact:

- manifest `$schema` (`https://orgsdk.ai/schemas/plugin-manifest.v1.json`)
- manifest `entry` (`index.ts`)
- `marketplace.links.sourceRepo` provenance link
- type-only import specifiers (`orgsdk/plugins` → `@orgsdk/plugins`)
- the generated artifact `package.json` carrying the two Google runtime
  dependencies

Because catalog versions are write-once, the existing `1.0.1` artifact cannot be
re-published with this changed content — it would differ and be rejected with
HTTP 409. Rather than mutate the published history of `1.0.1`, the new artifact
lands as a fresh `1.0.2` entry.

### Changed

- Bump `plugin/.plugin.json` version `1.0.1` → `1.0.2` (catalog source of
  truth).
- Bump `package.json` version `1.0.1` → `1.0.2` (kept in sync; enforced by the
  CI version guard).
- Add manifest `$schema`, `entry`, and `marketplace.links.sourceRepo`.
- Update type-only import specifiers `orgsdk/plugins` → `@orgsdk/plugins`.
- **Install-resolution correction (zero runtime change).** The published
  `dependencies` ranges are unchanged, but a repo-local `overrides` entry
  dedupes `google-auth-library` to a single copy for local typechecking. See
  [docs/contract-migration.md](docs/contract-migration.md#install-resolution-correction-zero-runtime-change).

### Frozen (unchanged from monorepo 1.0.1)

- All eleven safe functions — names, parameters, return types, metadata, tags,
  the readonly/write split (three readonly, eight write), and the two discovery
  flags.
- The shared `google-oauth` contract: **no authProvider** (functions-only),
  `requiredCredentials: ["google-oauth"]` on every function, no OAuth callback.
  google-sheets remains the sole connect owner.
- The `source: "first-party" | "byo"` discriminator and relay-refresh
  semantics in `oauth.ts` / `first-party-client.ts`.
- No `config` (no Zod schema), no `httpEndpoints`, no `tables`.
- The factory `PluginModule` entry shape (`default export` →
  `(ctx) => PluginModule`).
- The `@googleapis/tasks` (`^12.0.0`) and `google-auth-library` (`^10.6.2`)
  runtime dependencies and their usage.
- `plugin/docs/overview.md` and `plugin/guides/usage-patterns.md` — verbatim.

### Dependency-closure determination

`@googleapis/tasks@^12.0.0` (resolves to `12.0.0` — the source-declared
supported range; no root/latest drift). Its direct dependency is
`googleapis-common@^8.0.0`, which pins `google-auth-library@10.5.0` exactly.
`google-auth-library@^10.6.2` (declared at top level) resolves to `10.9.0`.

`Bun.build` (target: `bun`, format: `esm`, `external: ["zod"]`) inlines the
full closure (both Google packages and their transitives) into a single
deterministic `__bundle.js`. The daemon imports it directly — no `node_modules`,
no native binary. `tests/google-bundle.test.ts` verifies this end to end: the
bundle loads, the factory materializes all eleven safe functions with no
authProvider present — all without a network call.

### Server-process assumptions

- **Publish time:** `resolvePluginDeps` runs `bun install` + `Bun.build` in a
  temp staging dir. Requires network access to resolve both Google packages from
  npm. Produces a deterministic `__bundle.js` (pure JS).
- **Daemon runtime:** imports `__bundle.js` directly. No `node_modules`, no
  native binary. Works in the standard daemon container image. Makes outbound
  HTTPS to `www.googleapis.com` at call time (gated by the connected
  credential's scopes).
