const assert = require("node:assert/strict");
const { test } = require("node:test");
const { WabaMediaCache, WABA_MEDIA_CACHE_TTL_MS } = require("../dist/services/waba-media-cache.js");
const { getWabaMediaIdSchema } = require("../dist/schemas/waba-media.schema.js");

const now = new Date("2026-09-14T20:00:00.000Z");

function deferred() {
	let resolve;
	let reject;
	const promise = new Promise((resolvePromise, rejectPromise) => {
		resolve = resolvePromise;
		reject = rejectPromise;
	});
	return { promise, resolve, reject };
}

function createFixture(overrides = {}) {
	let file = {
		id: 501017,
		storage_id: 1,
		id_storage: "stored-image",
		waba_media_id: "1554141112917707",
		waba_media_uploaded_at: now,
		...overrides,
	};
	let uploadCount = 0;
	let writeCount = 0;
	let upload = async () => "2554141112917707";
	const dependencies = {
		now: () => now,
		findFile: async () => ({ ...file }),
		uploadFile: async (snapshot) => {
			assert.equal(snapshot.id_storage, "stored-image");
			uploadCount++;
			return upload();
		},
		replaceCache: async (snapshot, mediaId, uploadedAt) => {
			if (snapshot.waba_media_id !== file.waba_media_id ||
				snapshot.waba_media_uploaded_at?.getTime() !== file.waba_media_uploaded_at?.getTime()) {
				return false;
			}
			writeCount++;
			file = { ...file, waba_media_id: mediaId, waba_media_uploaded_at: uploadedAt };
			return true;
		},
	};
	return {
		cache: new WabaMediaCache(dependencies),
		dependencies,
		setUpload: (next) => { upload = next; },
		get file() { return file; },
		get uploadCount() { return uploadCount; },
		get writeCount() { return writeCount; },
	};
}

test("reuses an upload younger than 27 days without reading file bytes", async () => {
	const fixture = createFixture({ waba_media_uploaded_at: new Date(now.getTime() - WABA_MEDIA_CACHE_TTL_MS + 1) });
	assert.equal(await fixture.cache.getMediaId(501017), "1554141112917707");
	assert.equal(fixture.uploadCount, 0);
	assert.equal(fixture.writeCount, 0);
});

for (const [label, overrides] of [
	["an expired upload", { waba_media_uploaded_at: new Date(now.getTime() - WABA_MEDIA_CACHE_TTL_MS) }],
	["a legacy ID without upload timestamp", { waba_media_uploaded_at: null }],
	["a missing media ID", { waba_media_id: null }],
	["a malformed existing media ID", { waba_media_id: "not-a-media-id" }],
	["an invalid future upload timestamp", { waba_media_uploaded_at: new Date(now.getTime() + 1000) }],
]) {
	test(`refreshes ${label}`, async () => {
		const fixture = createFixture(overrides);
		assert.equal(await fixture.cache.getMediaId(501017), "2554141112917707");
		assert.equal(fixture.uploadCount, 1);
		assert.equal(fixture.file.waba_media_id, "2554141112917707");
		assert.equal(fixture.file.waba_media_uploaded_at, now);
	});
}

test("a provider rejection refreshes even a young cached ID", async () => {
	const fixture = createFixture();
	assert.equal(await fixture.cache.getMediaId(501017, "1554141112917707"), "2554141112917707");
	assert.equal(fixture.uploadCount, 1);
});

test("a stale rejection reuses a cache already replaced by another request", async () => {
	const fixture = createFixture({ waba_media_id: "2554141112917707" });
	assert.equal(await fixture.cache.getMediaId(501017, "1554141112917707"), "2554141112917707");
	assert.equal(fixture.uploadCount, 0);
});

test("simultaneous refreshes in one process upload the file once", async () => {
	const fixture = createFixture({ waba_media_uploaded_at: null });
	const uploadStarted = deferred();
	const uploadFinished = deferred();
	fixture.setUpload(() => { uploadStarted.resolve(); return uploadFinished.promise; });
	const requests = Array.from({ length: 20 }, () => fixture.cache.getMediaId(501017, "1554141112917707"));
	await uploadStarted.promise;
	uploadFinished.resolve("2554141112917707");
	assert.deepEqual(await Promise.all(requests), Array(20).fill("2554141112917707"));
	assert.equal(fixture.uploadCount, 1);
	assert.equal(fixture.writeCount, 1);
});

test("a late upload from another process cannot overwrite a newer cache", async () => {
	const fixture = createFixture({ waba_media_uploaded_at: null });
	const firstStarted = deferred();
	const firstFinished = deferred();
	const secondStarted = deferred();
	let calls = 0;
	fixture.setUpload(() => {
		if (++calls === 1) {
			firstStarted.resolve();
			return firstFinished.promise;
		}
		secondStarted.resolve();
		return Promise.resolve("3554141112917707");
	});
	const first = fixture.cache.getMediaId(501017);
	await firstStarted.promise;
	const secondProcess = new WabaMediaCache(fixture.dependencies);
	const second = secondProcess.getMediaId(501017);
	await secondStarted.promise;
	assert.equal(await second, "3554141112917707");
	firstFinished.resolve("4554141112917707");
	assert.equal(await first, "3554141112917707");
	assert.equal(fixture.file.waba_media_id, "3554141112917707");
	assert.equal(fixture.writeCount, 1);
});

test("a waiting rejection does not reuse the ID it rejected", async () => {
	const fixture = createFixture({ waba_media_uploaded_at: null });
	const firstStarted = deferred();
	const firstFinished = deferred();
	let calls = 0;
	fixture.setUpload(() => {
		if (++calls === 1) {
			firstStarted.resolve();
			return firstFinished.promise;
		}
		return Promise.resolve("6554141112917707");
	});
	const first = fixture.cache.getMediaId(501017);
	await firstStarted.promise;
	const rejected = fixture.cache.getMediaId(501017, "5554141112917707");
	firstFinished.resolve("5554141112917707");
	assert.equal(await first, "5554141112917707");
	assert.equal(await rejected, "6554141112917707");
	assert.equal(fixture.uploadCount, 2);
});

test("a failed upload preserves the cache and releases in-process coalescing", async () => {
	const fixture = createFixture({ waba_media_uploaded_at: null });
	fixture.setUpload(async () => { throw new Error("upload unavailable"); });
	await assert.rejects(fixture.cache.getMediaId(501017), /upload unavailable/);
	assert.equal(fixture.file.waba_media_id, "1554141112917707");
	assert.equal(fixture.file.waba_media_uploaded_at, null);
	assert.equal(fixture.writeCount, 0);
	fixture.setUpload(async () => "7554141112917707");
	assert.equal(await fixture.cache.getMediaId(501017), "7554141112917707");
	assert.equal(fixture.uploadCount, 2);
});

test("missing, malformed and rejected upload IDs are not cached or returned as usable media", async () => {
	for (const mediaId of [undefined, "", "   ", "not-a-media-id", "123 ", "1".repeat(256), "1554141112917707"]) {
		const fixture = createFixture();
		fixture.setUpload(async () => mediaId);
		await assert.rejects(fixture.cache.getMediaId(501017, "1554141112917707"), /invalid media ID|rejected media ID/);
		assert.equal(fixture.writeCount, 0);
	}
});

test("a persistence failure is surfaced and does not leave a completed upload stuck in memory", async () => {
	const fixture = createFixture({ waba_media_uploaded_at: null });
	const replaceCache = fixture.dependencies.replaceCache;
	fixture.dependencies.replaceCache = async () => { throw new Error("database unavailable"); };
	await assert.rejects(fixture.cache.getMediaId(501017), /database unavailable/);
	assert.equal(fixture.file.waba_media_uploaded_at, null);
	fixture.dependencies.replaceCache = replaceCache;
	assert.equal(await fixture.cache.getMediaId(501017), "2554141112917707");
	assert.equal(fixture.uploadCount, 2);
});

test("request validation keeps numeric-string file IDs and makes rejectedMediaId optional", () => {
	assert.deepEqual(getWabaMediaIdSchema.parse({ fileId: "501017" }), { fileId: 501017 });
	assert.deepEqual(getWabaMediaIdSchema.parse({ fileId: 501017, rejectedMediaId: "1554141112917707" }), {
		fileId: 501017, rejectedMediaId: "1554141112917707",
	});
	for (const fileId of [null, false, "", "  ", [], {}, 0, -1, 1.1, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
		assert.equal(getWabaMediaIdSchema.safeParse({ fileId }).success, false);
	}
	for (const rejectedMediaId of [null, 10, "", "  ", [], "x".repeat(256)]) {
		assert.equal(getWabaMediaIdSchema.safeParse({ fileId: 501017, rejectedMediaId }).success, false);
	}
});
