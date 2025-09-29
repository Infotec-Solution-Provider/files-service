import { File, FileDirType, Storage } from "@prisma/client";
import StorageInstance from "./storage-instance";
import axios, { CreateAxiosDefaults } from "axios";
import { AxiosInstance } from "axios";

interface WabaMediaResult {
	message: string;
	data: {
		id: string;
		name: string;
		type: string;
		size: number;
		date: string;
	}
}

class ClientStorageInstance implements StorageInstance {
	private _storage: Storage;
	private _xhr: AxiosInstance;

	constructor(storage: Storage, config: CreateAxiosDefaults) {
		this._storage = storage;
		this._xhr = axios.create(config);
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
			{ responseType: "stream" }
		);

		const buffer = await new Promise<Buffer>((resolve, reject) => {
			const chunks: Uint8Array[] = [];

			response.data.on("data", (chunk: Uint8Array) => {
				chunks.push(chunk);
			});

			response.data.on("end", () => {
				resolve(Buffer.concat(chunks));
			});

			response.data.on("error", (error: Error) => {
				reject(error);
			});
		});

		return buffer;
	}

	public async delete(file: File): Promise<void> {
		await this._xhr.delete(`/api/storage/${file.id_storage}`);
	}

	public async writeFromWabaMedia(wabaMediaId: string) {
		const res = await this._xhr.get<WabaMediaResult>(
			`/api/waba/media/${wabaMediaId}`
		);

		return res.data.data;
	}
}

export default ClientStorageInstance;
