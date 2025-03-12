import { File, FileDirType, Storage } from "@prisma/client";
import StorageInstance from "./storage-instance";
import axios, { CreateAxiosDefaults } from "axios";
import { AxiosInstance } from "axios";

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
		formData.append("file", new Blob([file.buffer]), file.originalname);

		const res = await this._xhr.post<{ id: string }>(
			`/files/${dirType}`,
			formData,
			{
				headers: { "Content-Type": "multipart/form-data" },
			}
		);

		return res.data;
	}

	public async read(file: File): Promise<Buffer> {
		const response = await this._xhr.get(
			`/files/${file.dir_type}/${file.id}`,
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
		await this._xhr.delete(`/files/${file.dir_type}/${file.id}`);
	}
}

export default ClientStorageInstance;
