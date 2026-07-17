# Google Tasks Plugin — Usage Patterns

This plugin (`google-tasks`) is functions-only: it consumes the shared
`google-oauth` credential but does not own the OAuth connect flow. Connect
Google once via the `google-sheets` plugin (Credentials tab "Connect Google"
button in the dashboard). The resulting credential covers both Sheets and Tasks.

## Google Tasks Sync Pattern

When syncing tasks between an internal table and Google Tasks:

1. `listTasks({ taskListId })` — get current remote state
2. `queryRows({ tableName: "tasks" })` — get local state
3. Diff by a stable key (e.g. `title` or a custom `externalId` field)
4. `createTask` for new items, `updateTask` for changed items
5. Never delete remote tasks without explicit approval — use `requestApproval` first
