# Google Tasks for OrgSDK

## Install in OrgSDK

Open your project's Plugins page, select this plugin and enable the pinned release.
The default catalogue is https://orgsdk.ai/plugins/releases.json. The executor
downloads the versioned bundle and verifies its SHA256. Configure the provider
and attach the credential described below before running an action.

The plugin is Apache-2.0 licensed; see LICENSE, NOTICE and TRADEMARKS.md.
The generated npm distribution is a separate publication surface. Installing npm
files alone does not register a project plugin. Local builds do not publish it.

## Credentials

Connect your own Google OAuth application in OrgSDK with `https://www.googleapis.com/auth/tasks`.
Enable the corresponding Google API and register the exact callback URL shown
by OrgSDK in your Google Cloud OAuth client. Attach the resulting `google-oauth`
credential to this project plugin. The host owns consent and token refresh;
execution receives only `{source: "byo", secret_accessToken}`. Client and refresh
secrets stay on the host. No hosted OAuth relay is supported.

A Google credential may be shared with another Google plugin only when its granted
scopes cover both plugins. Provider consent, app verification and account permissions
are required independently of installing this package.

## Functions

- `listTaskLists` — List all Google Task lists for the authenticated user.
- `createTaskList` — Create a new Google Task list.
- `deleteTaskList` — Delete a Google Task list by ID.
- `listTasks` — List tasks in a Google Task list. Options: showCompleted (default true), showHidden, dueMin/dueMax (RFC 3339), maxResults (default 100).
- `getTask` — Get a single Google Task by ID.
- `createTask` — Create a task in a Google Task list. Options: notes, due (RFC 3339 date string), parent (task ID for subtasks).
- `updateTask` — Update a Google Task. Pass an updates object with any of: title, notes, due (RFC 3339), status ("needsAction" or "completed").
- `completeTask` — Mark a Google Task as completed (sets status to "completed").
- `uncompleteTask` — Mark a Google Task as incomplete (sets status back to "needsAction").
- `deleteTask` — Delete a Google Task by ID.
- `clearCompletedTasks` — Clear all completed tasks from a Google Task list.

## Example action

```typescript
return await googleTasks.listTaskLists({});
```

Use named argument objects. Exact parameters and return types are in the release catalogue and the project tool contract.
