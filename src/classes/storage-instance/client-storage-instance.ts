import { File, FileDirType, Storage } from "@prisma/client";
import StorageInstance from "./storage-instance";
import { AxiosInstance } from "axios";

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
		const formData = new FormData();
		const uarr = new Uint8Array(file.buffer);

		formData.append("file", new Blob([uarr]), file.originalname);
		formData.append("folder", dirType);

		const res = await this._xhr.post<{ id: string }>(
			`/api/storage/`,
			formData,
			{
				headers: { "Content-Type": "multipart/form-data" },
			}
		);

		return res.data;
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
