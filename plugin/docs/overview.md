# Google Tasks

Read and manage Google Tasks — task lists and tasks. Shares the
**`google-oauth`** credential with `google-sheets`; connect once via the
google-sheets plugin's "Connect Google" button and both work.

## What it does

The `google-tasks` plugin exposes task-list CRUD: create task lists, add/complete/update
tasks, and clear completed items. It's the lightweight to-do surface for
Google Workspace — useful for turning workflow output into actionable items
without standing up a heavier tracker.

Typical uses:

- **Action capture** — when an agent identifies a follow-up, create a task in a
  named list.
- **Sync** — mirror issues/tickets into Google Tasks for human tracking.
- **Standup prep** — list open tasks for a person before a scheduled review.

## Functions

| Function | Purpose |
|---|---|
| `listTaskLists` | List all task lists. |
| `createTaskList` / `deleteTaskList` | Create / delete a task list. |
| `listTasks` | List tasks in a list. |
| `createTask` / `getTask` / `updateTask` / `deleteTask` | Task CRUD. |
| `completeTask` / `uncompleteTask` | Mark a task done / reopen it. |
| `clearCompletedTasks` | Remove all completed tasks from a list. |

The full function list (parameters, return types) is available via the
`plugins:info` command in the dashboard.

## Credentials

Every function declares `requiredCredentials: ["google-oauth"]`. This plugin
**does not own** an auth provider — it reuses the credential established by the
`google-sheets` plugin.

| Provider | Type | Connect method |
|---|---|---|
| `google-oauth` | oauth2 | Connect via the **google-sheets** plugin: one-click "Connect Google" when the relay has OrgSDK's first-party client, or paste your own OAuth client JSON (BYO). The granted scopes cover Sheets + Tasks. |

> No separate connect step for google-tasks — once `google-sheets` is
> connected, this plugin works immediately.

## Using it in a workflow

```typescript
// Ensure a list exists, then add a task
const lists = await listTaskLists();
let inbox = lists.find((l) => l.title === "Agent Inbox");
if (!inbox) inbox = await createTaskList({ title: "Agent Inbox" });

await createTask({
  taskListId: inbox.id,
  title: "Follow up with Acme on renewal",
  notes: "Flagged by the triage workflow on 2026-07-09",
});

// Tick off completed work
await clearCompletedTasks({ taskListId: inbox.id });
```

## Notes

- This plugin intentionally has **no authProvider** — it shares
  `google-oauth` with `google-sheets` to avoid a second OAuth round-trip.
- See `guides/usage-patterns.md` for agent-facing composition patterns.
