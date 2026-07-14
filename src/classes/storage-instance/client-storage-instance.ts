import { File, FileDirType, Storage } from "@prisma/client";
import StorageInstance from "./storage-instance";
import { AxiosInstance } from "axios";
import FormData from "form-data";

const STORAGE_CLIENT_CHUNK_SIZE_BYTES = Number(
	process.env["STORAGE_CLIENT_CHUNK_SIZE_BYTES"] || String(5 * 1024 * 1024),
);

interface WabaMediaResult {
	message: string;
	data: {
		id: string;
		name: string;
		type: string;
		size: number;
		date: string;
	};
}

interface WabaMediaIdResult {
	mediaId: string;
}

class ClientStorageInstance implements StorageInstance {
	private _storage: Storage;
	private _xhr: AxiosInstance;

	constructor(storage: Storage, axios: AxiosInstance) {
		this._storage = storage;
		this._xhr = axios;
	}

	public get data(): Storage {
		return this._storage;
	}

	public get instance(): string {
		return this._storage.instance;
	}

	public async write(
		dirType: FileDirType,
		file: Express.Multer.File
	): Promise<{ id: string }> {
		const totalChunks = Math.max(
			1,
			Math.ceil(file.buffer.length / STORAGE_CLIENT_CHUNK_SIZE_BYTES),
		);

		const initRes = await this._xhr.post<{ uploadId: string }>(
			`/api/storage/chunks/init`,
			{
				folder: dirType,
				fileName: file.originalname,
				fileType: file.mimetype,
				totalSize: file.buffer.length,
				totalChunks,
			},
		);

		const { uploadId } = initRes.data;

		for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
			const start = chunkIndex * STORAGE_CLIENT_CHUNK_SIZE_BYTES;
			const end = Math.min(start + STORAGE_CLIENT_CHUNK_SIZE_BYTES, file.buffer.length);
			const formData = new FormData();

			formData.append("chunk", file.buffer.subarray(start, end), {
				filename: file.originalname,
				contentType: file.mimetype,
			});
			formData.append("chunkIndex", String(chunkIndex));
			formData.append("totalChunks", String(totalChunks));

			await this._xhr.post(`/api/storage/chunks/${uploadId}`, formData, {
				headers: {
					"Content-Type": "multipart/form-data",
					...formData.getHeaders(),
				},
			});
		}

		const completeRes = await this._xhr.post<{ id: string }>(
			`/api/storage/chunks/${uploadId}/complete`,
			{},
		);

		return completeRes.data;
	}

	public async read(file: File): Promise<Buffer> {
		const response = await this._xhr.get(
			`/api/storage/${file.id_storage}`,
			{ responseType: "arraybuffer" }
		);

		return Buffer.from(response.data);
	}

	public async delete(file: File): Promise<void> {
		await this._xhr.delete(`/api/storage/${file.id_storage}`);
	}

	public async writeFromWabaMedia(wabaMediaId: string) {
		try {
			const res = await this._xhr.get<WabaMediaResult>(
				`/api/waba/media/${wabaMediaId}`
			);

			return res.data.data;
		} catch (err: any) {
			throw new Error(
				`An error ocurred while fetching media from the StorageClient: ${err.message}`
			);
		}
	}

	public async getMediaFromFileId(fileId: string): Promise<string> {
		const res = await this._xhr.post<WabaMediaIdResult>(
			`/api/waba/media`, { fileId }
		);

		return res.data.mediaId;
	}
}

export default ClientStorageInstance;
