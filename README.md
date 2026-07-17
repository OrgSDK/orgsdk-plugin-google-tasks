# @orgsdk/plugin-google-tasks

Official OrgSDK plugin for Google Tasks — task-list and task CRUD. Eleven safe
functions exposing the Google Tasks REST surface to agent workflows.
Functions-only: it consumes the shared **`google-oauth`** credential
(provider key `google-oauth`) but does **not** own the OAuth connect flow.
Connect Google once via the **google-sheets** plugin (one-click first-party or
paste your own BYO client) and the shared credential covers Tasks too.

[![CI](https://github.com/OrgSDK/orgsdk-plugin-google-tasks/actions/workflows/ci.yml/badge.svg)](https://github.com/OrgSDK/orgsdk-plugin-google-tasks/actions/workflows/ci.yml)

## Repository layout

```
orgsdk-plugin-google-tasks/
├── .github/workflows/
│   ├── ci.yml                 # calls the shared reusable CI workflow (OrgSDK/plugins)
│   └── publish-catalog.yml    # calls the shared reusable publish workflow (opt-in; manual dry-run)
├── plugin/                    # the publishable plugin folder
│   ├── .plugin.json           # manifest (slug, version, oauth2 google-oauth auth, marketplace)
│   ├── index.ts               # entry — factory (ctx) => PluginModule (functions-only, no authProvider)
│   ├── google-tasks-functions.ts  # eleven functions: task lists + tasks CRUD
│   ├── oauth.ts               # shared google-oauth bundle → OAuth2Client (first-party relay refresh | BYO local)
│   ├── first-party-client.ts  # relay /api/oauth/{config,exchange,refresh} client + access-token cache
│   ├── docs/overview.md       # plugin-local docs
│   └── guides/usage-patterns.md  # agent-facing composition patterns
├── tests/                     # bun:test — manifest, purity, shape, packaging, google-bundle smoke, credential-shape
├── docs/                      # contract migration, release/promotion contract
├── package.json
├── tsconfig.json
├── biome.json
└── README.md
```

The `plugin/` folder is the canonical source for the `google-tasks` plugin; it
is published to the OrgSDK catalog on merge to `main` when opted in via the
`ORGSDK_ENABLE_CATALOG_PUBLISH` repo variable (see [docs/release.md](docs/release.md)).

## Local development

Requires [Bun](https://bun.sh) ≥ 1.3.x.

```bash
# Install (frozen lockfile in CI; dev: generates one)
bun install

# Lint + format check
bun run check

# Typecheck (no emit)
bun run typecheck

# Run tests
bun run test

# Validate manifest + source purity (orgsdk-plugin validate)
bun run validate

# Stage distributable artifact into dist/ (orgsdk-plugin package)
bun run package

# Full build pipeline (typecheck → validate → package)
bun run build
```

The `validate`, `package`, `version-guard`, and `publish` npm scripts delegate to
the [`orgsdk-plugin`](https://www.npmjs.com/package/@orgsdk/plugins) CLI shipped
by the `@orgsdk/plugins` dev dependency. There are no local management scripts.

## Functions

Eleven functions across task lists and tasks. Three are readonly (read-only
Google Tasks GETs), eight are write (mutating). Two readonly functions are
tagged `discovery` (safe to use in exploration workflows).

| Group | Readonly | Write |
|---|---|---|
| Task lists (3) | listTaskLists | createTaskList, deleteTaskList |
| Tasks (8) | listTasks, getTask | createTask, updateTask, completeTask, uncompleteTask, deleteTask, clearCompletedTasks |

Every function declares `requiredCredentials: ["google-oauth"]` — none are
callable until the shared credential is connected via google-sheets.

## Credentials & the coordinated Google train

This plugin is **functions-only** — it has no `authProvider` and no OAuth
callback. The shared `google-oauth` credential is owned and connected by the
**google-sheets** plugin. This repository never registers a second connect
owner; doing so would create a duplicate OAuth round-trip for tenants.

| Provider | Type | Connect method |
|---|---|---|
| `google-oauth` | oauth2 | Connect via the **google-sheets** plugin: one-click "Connect Google" when the relay has OrgSDK's first-party client, or paste your own OAuth client JSON (BYO). The granted scopes cover Sheets + Tasks. |

### The `source` discriminator (frozen contract)

A stored `google-oauth` bundle carries a `source` field set at connect time:

- **`source: "first-party"`** — OrgSDK's relay holds the client secret. This
  plugin fetches a fresh access token from the relay's `/api/oauth/refresh`
  endpoint (cached per refresh token); the bundle carries no `client_secret`.
- **`source: "byo"`** (or absent/legacy) — the tenant's own OAuth client. The
  plugin refreshes locally using the bundled `client_secret`.

The provider key (`google-oauth`) and this discriminator must never change —
both plugins (sheets + tasks) and the relay depend on them. See
[docs/contract-migration.md](docs/contract-migration.md).

> No separate connect step for google-tasks — once google-sheets is connected,
> this plugin works immediately.

## Manifest & version rules

- The manifest lives at `plugin/.plugin.json`.
- `version` is the **source of truth** for the catalog — bump it on every
  publishable content change (the CI version guard enforces this).
- `package.json` → `version` is kept in sync with the manifest (enforced by the
  version guard).
- Versions are **write-once** in the catalog: re-publishing the same
  `(slug, version)` with identical content is idempotent; differing content is
  rejected (HTTP 409). Treat every publish as forward-only.
- See [docs/release.md](docs/release.md) for the automatic publish model and
  required repository settings.

## CI/CD

CI and catalog publishing delegate to centrally maintained **reusable
workflows** in [OrgSDK/plugins](https://github.com/OrgSDK/plugins), pinned to an
immutable commit. The caller workflows (`.github/workflows/`) only wire up
triggers, the opt-in gate, artifact names, and secrets — no plugin mechanics
are duplicated. See the
[reusable-workflows docs](https://github.com/OrgSDK/plugins/blob/main/docs/reusable-workflows.md)
for the full contract.

## Runtime dependencies: @googleapis/tasks + google-auth-library

`google-tasks-functions.ts` imports `tasks_v1` from
[`@googleapis/tasks`](https://www.npmjs.com/package/@googleapis/tasks)
(`^12.0.0`, the source-declared supported range) and constructs a
`tasks_v1.Tasks` client; `oauth.ts` imports `OAuth2Client` from
[`google-auth-library`](https://www.npmjs.com/package/google-auth-library)
(`^10.6.2`). At publish time, the platform's `resolvePluginDeps` bundles the
plugin entry plus both packages (and their full transitive closure:
`googleapis-common`, `gaxios`, `https-proxy-agent`, `jws`, `googleads-info`,
… ) into a single `__bundle.js` ESM file via `Bun.build`. The daemon imports
that bundle directly — there is **no runtime node_modules resolution** in the
tenant container.

See [docs/contract-migration.md](docs/contract-migration.md) for the full
dependency-closure analysis and the install-resolution correction.

## Security constraints

- Functions-only auth — no `authProvider`, no `httpEndpoints`, no auth callback.
  The shared `google-oauth` credential is injected per-call as the leading
  `credentials` argument; the `source` discriminator selects first-party
  (relay-owned refresh) vs BYO (local refresh) handling. Secrets are never
  logged.
- Source purity is enforced: no imports from private `@orgsdk/*` packages, no
  cross-plugin imports (oauth.ts + first-party-client.ts are self-contained
  duplicates of the google-sheets leaf modules — cloud-mode plugins must be
  self-contained because the materialiser blocks sibling imports), no runtime
  value imports from the authoring SDK. The `validate` script and
  `tests/purity.test.ts` guard this.
- Publish credentials (`ORGSDK_PUBLISH_TOKEN`) live as a GitHub secret
  (repository-level or `catalog-publish` environment); they are never committed
  to the repo. See [docs/release.md](docs/release.md).

> **Pre-existing security/resource concerns (frozen, not refactored in this
> extraction).** Every handler issues an authenticated Google Tasks request with
> no per-call allow/deny list, rate-limit guard, or response-size cap. The scope
> of what an agent can do is bounded only by the connected credential's scopes.
> `deleteTaskList`, `deleteTask`, and `clearCompletedTasks` are destructive
> (irreversible). These behaviors are frozen verbatim per the migration
> discipline. See
> [docs/contract-migration.md](docs/contract-migration.md#known-pre-existing-issues-recorded-not-fixed-in-this-release).

## Authoring contract & runtime dependencies

The plugin authoring types come from the public
[`@orgsdk/plugins`](https://www.npmjs.com/package/@orgsdk/plugins) npm package,
imported type-only (`import type { … } from "@orgsdk/plugins"`). The SDK is a
dev-only dependency. The runtime artifact carries **two** runtime dependencies —
`@googleapis/tasks` (`^12.0.0`) and `google-auth-library` (`^10.6.2`).

See [docs/contract-migration.md](docs/contract-migration.md).

## Source attribution

Extracted from the OrgSDK monorepo at:

- **Source path:** `packages/plugins/src/google-tasks/`
- **Last monorepo commit touching the source:** `bd41214`
- **Monorepo HEAD at extraction:** `8e2442074db8ceedf0fccb45d21fd8f0335a69ea`

No plugin behavior changed in this extraction — only the type-only import
specifiers (`orgsdk/plugins` → `@orgsdk/plugins`), the manifest `$schema`,
`entry`, `version`, and `marketplace.links.sourceRepo` were added.

## License

Proprietary — All rights reserved. This source is the confidential property
of OrgSDK. No part of this repository may be reproduced, distributed, or
transmitted in any form without the prior written permission of OrgSDK.
Unauthorized use, modification, or redistribution is strictly prohibited.
