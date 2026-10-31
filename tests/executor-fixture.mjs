import assert from "node:assert/strict";
import nock from "nock";

const task = { id: "task", title: "Synthetic task", status: "needsAction" };
export default async function createFixture() {
	const fixture = {
		nativeNetworkMock: true,
		nativeRequests: 0,
		configuration: {},
		provider: "google-oauth",
		secret: {
			source: "byo",
			secret_accessToken: "synthetic-access",
		},
		async fetch(request) {
			const url = new URL(request.url);
			assert.equal(
				request.headers.get("authorization"),
				"Bearer synthetic-access",
			);
			assert.equal(url.origin, "https://tasks.googleapis.com");
			const path = url.pathname;
			if (path === "/tasks/v1/users/@me/lists")
				return Response.json(
					request.method === "POST"
						? { id: "list", title: "Synthetic list" }
						: { items: [{ id: "list", title: "Synthetic list" }] },
				);
			if (
				path === "/tasks/v1/users/@me/lists/list" &&
				request.method === "DELETE"
			)
				return new Response(null, { status: 204 });
			if (path === "/tasks/v1/lists/list/clear")
				return new Response(null, { status: 204 });
			if (path === "/tasks/v1/lists/list/tasks")
				return Response.json(
					request.method === "POST" ? task : { items: [task] },
				);
			if (path === "/tasks/v1/lists/list/tasks/task") {
				if (request.method === "DELETE")
					return new Response(null, { status: 204 });
				if (request.method === "PUT")
					return Response.json({ ...task, ...(await request.json()) });
				return Response.json(task);
			}
			assert.fail(path);
		},
		async run(call) {
			assert.equal((await call("listTaskLists"))[0].id, "list");
			assert.equal(
				(await call("createTaskList", { title: "Synthetic list" })).id,
				"list",
			);
			assert.equal(
				(await call("listTasks", { taskListId: "list" }))[0].id,
				"task",
			);
			assert.equal(
				(await call("getTask", { taskListId: "list", taskId: "task" })).id,
				"task",
			);
			assert.equal(
				(
					await call("createTask", {
						taskListId: "list",
						title: "Synthetic task",
					})
				).id,
				"task",
			);
			assert.equal(
				(
					await call("updateTask", {
						taskListId: "list",
						taskId: "task",
						updates: { title: "Updated" },
					})
				).title,
				"Updated",
			);
			assert.equal(
				(await call("completeTask", { taskListId: "list", taskId: "task" }))
					.status,
				"completed",
			);
			assert.equal(
				(await call("uncompleteTask", { taskListId: "list", taskId: "task" }))
					.status,
				"needsAction",
			);
			assert.equal(
				(await call("deleteTask", { taskListId: "list", taskId: "task" }))
					.success,
				true,
			);
			assert.equal(
				(await call("clearCompletedTasks", { taskListId: "list" })).success,
				true,
			);
			assert.equal(
				(await call("deleteTaskList", { taskListId: "list" })).success,
				true,
			);
		},
		close() {
			nock.cleanAll();
			nock.enableNetConnect();
			nock.restore();
		},
	};
	nock.disableNetConnect();
	for (const origin of ["https://tasks.googleapis.com"]) {
		for (const method of ["GET", "POST", "PUT", "PATCH", "DELETE"]) {
			nock(origin)
				.persist()
				.intercept(/.*/, method)
				.reply(async (request) => {
					fixture.nativeRequests++;
					const response = await fixture.fetch(request);
					return [
						response.status,
						Buffer.from(await response.arrayBuffer()),
						Object.fromEntries(response.headers),
					];
				});
		}
	}
	return fixture;
}
