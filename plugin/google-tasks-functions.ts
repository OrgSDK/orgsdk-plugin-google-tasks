import type { SafeFunction } from "@orgsdk/plugins";
export const moduleDescription =
	"Create, manage, and organize Google Tasks and task lists";

import { tasks_v1 } from "@googleapis/tasks";
import type { GoogleOAuthBundle } from "./oauth.ts";
import { getGoogleOAuth2Client } from "./oauth.ts";

type TaskList = {
	id: string;
	title: string;
	updated?: string;
};

type Task = {
	id: string;
	title: string;
	status: "needsAction" | "completed";
	notes?: string;
	due?: string;
	completed?: string;
	parent?: string;
	position?: string;
	updated?: string;
};

function getGoogleOAuth(creds: Record<string, unknown>): GoogleOAuthBundle {
	return (creds["google-oauth"] as GoogleOAuthBundle | undefined) ?? {};
}

async function createTasksClient(
	credentials: Record<string, unknown>,
): Promise<tasks_v1.Tasks> {
	if (!credentials["google-oauth"]) {
		throw new Error(
			"Missing google-oauth credential. Create .secrets/google-oauth.json",
		);
	}

	const google = getGoogleOAuth(credentials);
	const auth = await getGoogleOAuth2Client(google);
	return new tasks_v1.Tasks({ auth });
}

export const safeFunctions: SafeFunction[] = [
	// ── Task List Operations ──────────────────────────────────────────

	{
		name: "listTaskLists",
		requiredCredentials: ["google-oauth"],
		handler: async (
			credentials: Record<string, unknown>,
		): Promise<TaskList[]> => {
			const service = await createTasksClient(credentials);
			const resp = await service.tasklists.list({ maxResults: 100 });
			return (resp.data.items ?? []).map((tl) => ({
				id: tl.id!,
				title: tl.title ?? "",
				updated: tl.updated ?? undefined,
			}));
		},
		description: "List all Google Task lists for the authenticated user.",
		returnType:
			"Promise<Array<{ id: string; title: string; updated?: string }>>",
		parameters: [],
		metadata: {
			category: "google",
			tags: ["readonly", "auth", "discovery"],
			readonly: true,
			discovery: true,
			version: "1.0.0",
			relatedTo: ["createTaskList", "listTasks"],
		},
	},
	{
		name: "createTaskList",
		requiredCredentials: ["google-oauth"],
		handler: async (
			credentials: Record<string, unknown>,
			{ title }: { title: string },
		): Promise<TaskList> => {
			if (typeof title !== "string" || !title.trim()) {
				throw new Error("createTaskList: title is required");
			}

			const service = await createTasksClient(credentials);
			const resp = await service.tasklists.insert({
				requestBody: { title: title.trim() },
			});
			return {
				id: resp.data.id!,
				title: resp.data.title ?? "",
				updated: resp.data.updated ?? undefined,
			};
		},
		description: "Create a new Google Task list.",
		returnType: "Promise<{ id: string; title: string; updated?: string }>",
		parameters: [{ name: "title", type: "string" }],
		metadata: {
			category: "google",
			tags: ["io", "auth"],
			version: "1.0.0",
			relatedTo: ["listTaskLists", "deleteTaskList"],
		},
	},
	{
		name: "deleteTaskList",
		requiredCredentials: ["google-oauth"],
		handler: async (
			credentials: Record<string, unknown>,
			{ taskListId }: { taskListId: string },
		): Promise<{ success: boolean }> => {
			if (typeof taskListId !== "string" || !taskListId) {
				throw new Error("deleteTaskList: taskListId is required");
			}

			const service = await createTasksClient(credentials);
			await service.tasklists.delete({ tasklist: taskListId });
			return { success: true };
		},
		description: "Delete a Google Task list by ID.",
		returnType: "Promise<{ success: boolean }>",
		parameters: [{ name: "taskListId", type: "string" }],
		metadata: {
			category: "google",
			tags: ["io", "auth"],
			version: "1.0.0",
			relatedTo: ["listTaskLists", "createTaskList"],
		},
	},

	// ── Task Operations ───────────────────────────────────────────────

	{
		name: "listTasks",
		requiredCredentials: ["google-oauth"],
		handler: async (
			credentials: Record<string, unknown>,
			{
				taskListId,
				options,
			}: {
				taskListId: string;
				options?: {
					showCompleted?: boolean;
					showHidden?: boolean;
					dueMin?: string;
					dueMax?: string;
					maxResults?: number;
				};
			},
		): Promise<Task[]> => {
			if (typeof taskListId !== "string" || !taskListId) {
				throw new Error("listTasks: taskListId is required");
			}

			const service = await createTasksClient(credentials);
			const resp = await service.tasks.list({
				tasklist: taskListId,
				showCompleted: options?.showCompleted ?? true,
				showHidden: options?.showHidden ?? false,
				dueMin: options?.dueMin,
				dueMax: options?.dueMax,
				maxResults: options?.maxResults ?? 100,
			});

			return (resp.data.items ?? []).map((t) => ({
				id: t.id!,
				title: t.title ?? "",
				status: (t.status as "needsAction" | "completed") ?? "needsAction",
				notes: t.notes ?? undefined,
				due: t.due ?? undefined,
				completed: t.completed ?? undefined,
				parent: t.parent ?? undefined,
				position: t.position ?? undefined,
				updated: t.updated ?? undefined,
			}));
		},
		description:
			"List tasks in a Google Task list. Options: showCompleted (default true), showHidden, dueMin/dueMax (RFC 3339), maxResults (default 100).",
		returnType:
			"Promise<Array<{ id: string; title: string; status: string; notes?: string; due?: string; completed?: string; parent?: string; position?: string; updated?: string }>>",
		parameters: [
			{ name: "taskListId", type: "string" },
			{
				name: "options",
				type: "{ showCompleted?: boolean; showHidden?: boolean; dueMin?: string; dueMax?: string; maxResults?: number }",
			},
		],
		metadata: {
			category: "google",
			tags: ["readonly", "auth", "discovery"],
			readonly: true,
			discovery: true,
			version: "1.0.0",
			relatedTo: ["getTask", "createTask", "listTaskLists"],
		},
	},
	{
		name: "getTask",
		requiredCredentials: ["google-oauth"],
		handler: async (
			credentials: Record<string, unknown>,
			{ taskListId, taskId }: { taskListId: string; taskId: string },
		): Promise<Task> => {
			if (typeof taskListId !== "string" || !taskListId) {
				throw new Error("getTask: taskListId is required");
			}
			if (typeof taskId !== "string" || !taskId) {
				throw new Error("getTask: taskId is required");
			}

			const service = await createTasksClient(credentials);
			const resp = await service.tasks.get({
				tasklist: taskListId,
				task: taskId,
			});
			return {
				id: resp.data.id!,
				title: resp.data.title ?? "",
				status:
					(resp.data.status as "needsAction" | "completed") ?? "needsAction",
				notes: resp.data.notes ?? undefined,
				due: resp.data.due ?? undefined,
				completed: resp.data.completed ?? undefined,
				parent: resp.data.parent ?? undefined,
				position: resp.data.position ?? undefined,
				updated: resp.data.updated ?? undefined,
			};
		},
		description: "Get a single Google Task by ID.",
		returnType:
			"Promise<{ id: string; title: string; status: string; notes?: string; due?: string; completed?: string; parent?: string; position?: string; updated?: string }>",
		parameters: [
			{ name: "taskListId", type: "string" },
			{ name: "taskId", type: "string" },
		],
		metadata: {
			category: "google",
			tags: ["readonly", "auth"],
			readonly: true,
			version: "1.0.0",
			relatedTo: ["listTasks", "updateTask"],
		},
	},
	{
		name: "createTask",
		requiredCredentials: ["google-oauth"],
		handler: async (
			credentials: Record<string, unknown>,
			{
				taskListId,
				title,
				options,
			}: {
				taskListId: string;
				title: string;
				options?: { notes?: string; due?: string; parent?: string };
			},
		): Promise<Task> => {
			if (typeof taskListId !== "string" || !taskListId) {
				throw new Error("createTask: taskListId is required");
			}
			if (typeof title !== "string" || !title.trim()) {
				throw new Error("createTask: title is required");
			}

			const service = await createTasksClient(credentials);
			const resp = await service.tasks.insert({
				tasklist: taskListId,
				parent: options?.parent,
				requestBody: {
					title: title.trim(),
					notes: options?.notes,
					due: options?.due,
				},
			});

			return {
				id: resp.data.id!,
				title: resp.data.title ?? "",
				status:
					(resp.data.status as "needsAction" | "completed") ?? "needsAction",
				notes: resp.data.notes ?? undefined,
				due: resp.data.due ?? undefined,
				completed: resp.data.completed ?? undefined,
				parent: resp.data.parent ?? undefined,
				position: resp.data.position ?? undefined,
				updated: resp.data.updated ?? undefined,
			};
		},
		description:
			"Create a task in a Google Task list. Options: notes, due (RFC 3339 date string), parent (task ID for subtasks).",
		returnType:
			"Promise<{ id: string; title: string; status: string; notes?: string; due?: string; parent?: string; position?: string; updated?: string }>",
		parameters: [
			{ name: "taskListId", type: "string" },
			{ name: "title", type: "string" },
			{
				name: "options",
				type: "{ notes?: string; due?: string; parent?: string }",
			},
		],
		metadata: {
			category: "google",
			tags: ["io", "auth"],
			version: "1.0.0",
			relatedTo: ["listTasks", "updateTask", "completeTask", "deleteTask"],
		},
	},
	{
		name: "updateTask",
		requiredCredentials: ["google-oauth"],
		handler: async (
			credentials: Record<string, unknown>,
			{
				taskListId,
				taskId,
				updates,
			}: {
				taskListId: string;
				taskId: string;
				updates: {
					title?: string;
					notes?: string;
					due?: string;
					status?: string;
				};
			},
		): Promise<Task> => {
			if (typeof taskListId !== "string" || !taskListId) {
				throw new Error("updateTask: taskListId is required");
			}
			if (typeof taskId !== "string" || !taskId) {
				throw new Error("updateTask: taskId is required");
			}
			if (!updates || typeof updates !== "object") {
				throw new Error("updateTask: updates object is required");
			}

			const service = await createTasksClient(credentials);

			// Fetch current task to merge updates
			const current = await service.tasks.get({
				tasklist: taskListId,
				task: taskId,
			});
			const body = { ...current.data, ...updates };

			const resp = await service.tasks.update({
				tasklist: taskListId,
				task: taskId,
				requestBody: body,
			});

			return {
				id: resp.data.id!,
				title: resp.data.title ?? "",
				status:
					(resp.data.status as "needsAction" | "completed") ?? "needsAction",
				notes: resp.data.notes ?? undefined,
				due: resp.data.due ?? undefined,
				completed: resp.data.completed ?? undefined,
				parent: resp.data.parent ?? undefined,
				position: resp.data.position ?? undefined,
				updated: resp.data.updated ?? undefined,
			};
		},
		description:
			'Update a Google Task. Pass an updates object with any of: title, notes, due (RFC 3339), status ("needsAction" or "completed").',
		returnType:
			"Promise<{ id: string; title: string; status: string; notes?: string; due?: string; completed?: string; parent?: string; position?: string; updated?: string }>",
		parameters: [
			{ name: "taskListId", type: "string" },
			{ name: "taskId", type: "string" },
			{
				name: "updates",
				type: '{ title?: string; notes?: string; due?: string; status?: "needsAction" | "completed" }',
			},
		],
		metadata: {
			category: "google",
			tags: ["io", "auth"],
			version: "1.0.0",
			relatedTo: ["getTask", "completeTask", "uncompleteTask"],
		},
	},
	{
		name: "completeTask",
		requiredCredentials: ["google-oauth"],
		handler: async (
			credentials: Record<string, unknown>,
			{ taskListId, taskId }: { taskListId: string; taskId: string },
		): Promise<Task> => {
			if (typeof taskListId !== "string" || !taskListId) {
				throw new Error("completeTask: taskListId is required");
			}
			if (typeof taskId !== "string" || !taskId) {
				throw new Error("completeTask: taskId is required");
			}

			const service = await createTasksClient(credentials);
			const current = await service.tasks.get({
				tasklist: taskListId,
				task: taskId,
			});
			const resp = await service.tasks.update({
				tasklist: taskListId,
				task: taskId,
				requestBody: { ...current.data, status: "completed" },
			});

			return {
				id: resp.data.id!,
				title: resp.data.title ?? "",
				status:
					(resp.data.status as "needsAction" | "completed") ?? "completed",
				notes: resp.data.notes ?? undefined,
				due: resp.data.due ?? undefined,
				completed: resp.data.completed ?? undefined,
				parent: resp.data.parent ?? undefined,
				position: resp.data.position ?? undefined,
				updated: resp.data.updated ?? undefined,
			};
		},
		description:
			'Mark a Google Task as completed (sets status to "completed").',
		returnType:
			"Promise<{ id: string; title: string; status: string; notes?: string; due?: string; completed?: string; parent?: string; position?: string; updated?: string }>",
		parameters: [
			{ name: "taskListId", type: "string" },
			{ name: "taskId", type: "string" },
		],
		metadata: {
			category: "google",
			tags: ["io", "auth"],
			version: "1.0.0",
			relatedTo: ["uncompleteTask", "updateTask", "clearCompletedTasks"],
		},
	},
	{
		name: "uncompleteTask",
		requiredCredentials: ["google-oauth"],
		handler: async (
			credentials: Record<string, unknown>,
			{ taskListId, taskId }: { taskListId: string; taskId: string },
		): Promise<Task> => {
			if (typeof taskListId !== "string" || !taskListId) {
				throw new Error("uncompleteTask: taskListId is required");
			}
			if (typeof taskId !== "string" || !taskId) {
				throw new Error("uncompleteTask: taskId is required");
			}

			const service = await createTasksClient(credentials);
			const current = await service.tasks.get({
				tasklist: taskListId,
				task: taskId,
			});
			const resp = await service.tasks.update({
				tasklist: taskListId,
				task: taskId,
				requestBody: {
					...current.data,
					status: "needsAction",
					completed: null,
				},
			});

			return {
				id: resp.data.id!,
				title: resp.data.title ?? "",
				status:
					(resp.data.status as "needsAction" | "completed") ?? "needsAction",
				notes: resp.data.notes ?? undefined,
				due: resp.data.due ?? undefined,
				completed: resp.data.completed ?? undefined,
				parent: resp.data.parent ?? undefined,
				position: resp.data.position ?? undefined,
				updated: resp.data.updated ?? undefined,
			};
		},
		description:
			'Mark a Google Task as incomplete (sets status back to "needsAction").',
		returnType:
			"Promise<{ id: string; title: string; status: string; notes?: string; due?: string; completed?: string; parent?: string; position?: string; updated?: string }>",
		parameters: [
			{ name: "taskListId", type: "string" },
			{ name: "taskId", type: "string" },
		],
		metadata: {
			category: "google",
			tags: ["io", "auth"],
			version: "1.0.0",
			relatedTo: ["completeTask", "updateTask"],
		},
	},
	{
		name: "deleteTask",
		requiredCredentials: ["google-oauth"],
		handler: async (
			credentials: Record<string, unknown>,
			{ taskListId, taskId }: { taskListId: string; taskId: string },
		): Promise<{ success: boolean }> => {
			if (typeof taskListId !== "string" || !taskListId) {
				throw new Error("deleteTask: taskListId is required");
			}
			if (typeof taskId !== "string" || !taskId) {
				throw new Error("deleteTask: taskId is required");
			}

			const service = await createTasksClient(credentials);
			await service.tasks.delete({ tasklist: taskListId, task: taskId });
			return { success: true };
		},
		description: "Delete a Google Task by ID.",
		returnType: "Promise<{ success: boolean }>",
		parameters: [
			{ name: "taskListId", type: "string" },
			{ name: "taskId", type: "string" },
		],
		metadata: {
			category: "google",
			tags: ["io", "auth"],
			version: "1.0.0",
			relatedTo: ["createTask", "listTasks"],
		},
	},
	{
		name: "clearCompletedTasks",
		requiredCredentials: ["google-oauth"],
		handler: async (
			credentials: Record<string, unknown>,
			{ taskListId }: { taskListId: string },
		): Promise<{ success: boolean }> => {
			if (typeof taskListId !== "string" || !taskListId) {
				throw new Error("clearCompletedTasks: taskListId is required");
			}

			const service = await createTasksClient(credentials);
			await service.tasks.clear({ tasklist: taskListId });
			return { success: true };
		},
		description: "Clear all completed tasks from a Google Task list.",
		returnType: "Promise<{ success: boolean }>",
		parameters: [{ name: "taskListId", type: "string" }],
		metadata: {
			category: "google",
			tags: ["io", "auth"],
			version: "1.0.0",
			relatedTo: ["completeTask", "listTasks"],
		},
	},
];
