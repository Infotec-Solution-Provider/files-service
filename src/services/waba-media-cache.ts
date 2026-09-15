import type { File } from "@prisma/client";

// Refresh before Meta's 30-day media retention limit. File creation time is unrelated
// to upload time; legacy cache entries without a timestamp must be uploaded again.
export const WABA_MEDIA_CACHE_TTL_MS = 27 * 24 * 60 * 60 * 1000;

function isValidMediaId(mediaId: unknown): mediaId is string {
	return typeof mediaId === "string" && /^\d{1,255}$/.test(mediaId);
}

type CachedMediaFile = Pick<
	File,
	"id" | "storage_id" | "id_storage" | "waba_media_id" | "waba_media_uploaded_at"
>;

interface WabaMediaCacheDependencies {
	findFile(id: number): Promise<CachedMediaFile>;
	uploadFile(file: CachedMediaFile): Promise<string>;
	// Replace only the cache snapshot read before uploading, never a newer value.
	replaceCache(file: CachedMediaFile, mediaId: string, uploadedAt: Date): Promise<boolean>;
	now?: () => Date;
}

export class WabaMediaCache {
	private readonly uploads = new Map<number, Promise<string>>();
	private readonly now: () => Date;

	constructor(private readonly dependencies: WabaMediaCacheDependencies) {
		this.now = dependencies.now ?? (() => new Date());
	}

	public async getMediaId(id: number, rejectedMediaId?: string): Promise<string> {
		for (;;) {
			const pending = this.uploads.get(id);
			if (pending) {
				await pending;
				// A waiting caller may reject a different ID: reread before reusing it.
				continue;
			}

			const file = await this.dependencies.findFile(id);
			if (this.isReusable(file, rejectedMediaId)) {
				return file.waba_media_id!;
			}

			// Another caller may have begun uploading while this database read ran.
			if (this.uploads.has(id)) {
				continue;
			}

			const upload = this.refresh(file, rejectedMediaId);
			this.uploads.set(id, upload);
			try {
				return await upload;
			} finally {
				if (this.uploads.get(id) === upload) {
					this.uploads.delete(id);
				}
			}
		}
	}

	private isReusable(file: CachedMediaFile, rejectedMediaId?: string): boolean {
		if (!isValidMediaId(file.waba_media_id) || file.waba_media_id === rejectedMediaId || !file.waba_media_uploaded_at) {
			return false;
		}

		const age = this.now().getTime() - file.waba_media_uploaded_at.getTime();
		return age >= 0 && age < WABA_MEDIA_CACHE_TTL_MS;
	}

	private async refresh(file: CachedMediaFile, rejectedMediaId?: string): Promise<string> {
		const uploadedAt = this.now();
		const mediaId = await this.dependencies.uploadFile(file);
		if (!isValidMediaId(mediaId)) {
			throw new Error("WABA media upload returned an invalid media ID");
		}
		if (mediaId === rejectedMediaId) {
			throw new Error("WABA media upload returned the rejected media ID");
		}

		if (await this.dependencies.replaceCache(file, mediaId, uploadedAt)) {
			return mediaId;
		}

		// Another process refreshed this file. Reuse its fresh ID without overwriting
		// it; if it is unusable for this caller, our successful upload is still valid.
		const current = await this.dependencies.findFile(file.id);
		return this.isReusable(current, rejectedMediaId) ? current.waba_media_id! : mediaId;
	}
}
