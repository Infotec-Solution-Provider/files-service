import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import StorageInstance from "./storage-instance";
import { File, FileDirType, Storage } from "@prisma/client";
import { randomUUID } from "node:crypto";

class ServerStorageInstance implements StorageInstance {
	private _dirTemplate: string;
	private _storage: Storage;

	constructor(storage: Storage, filesDirTemplate: string) {
		this._dirTemplate = filesDirTemplate;
		this._storage = storage;
	}

	public get data(): Storage {
		return this._storage;
	}

	public get instance(): string {
		return this._storage.instance;
	}

	private fileToDir(
		dirType: FileDirType,
		id: string,
		fileName: string = ""
	): string {
		const filePath = this._dirTemplate
			.replace(":instance", this._storage.instance)
			.replace(":type", dirType)
			.replace(":id", id)
			.concat(fileName ? "\\" + fileName : "");

		return filePath;
	}

	public async write(
		dirType: FileDirType,
		file: Express.Multer.File
	): Promise<{ id: string }> {
		const id = randomUUID();
		const fileDir = this.fileToDir(dirType, id);

		await mkdir(fileDir, { recursive: true });
		await writeFile(fileDir.concat("\\" + file.originalname), file.buffer);

		return { id };
	}

	public async read(file: File): Promise<Buffer> {
		return await readFile(
			this.fileToDir(file.dir_type, file.id_storage, file.name)
		);
	}

	public async delete(file: File): Promise<void> {
		return await rm(this.fileToDir(file.dir_type, file.id_storage), {
			recursive: true,
		});
	}
}

export default ServerStorageInstance;
