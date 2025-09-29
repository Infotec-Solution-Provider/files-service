import { File, FileDirType } from "@prisma/client";
import StoredFile from "../classes/stored-file";
import prismaService from "./prisma.service";
import storagesService from "./storages.service";

class FilesService {
	private readonly storageService: typeof storagesService;

	constructor(storageService: typeof storagesService) {
		this.storageService = storageService;
	}

	public async getFile(id: number): Promise<StoredFile> {
		const file = await prismaService.file.findUniqueOrThrow({
			where: { id },
		});
		const storage = this.storageService.getStorageInstance(file.storage_id);
		const buffer = await storage.read(file);

		return new StoredFile(file, buffer);
	}

	public async uploadFile(
		instance: string,
		dirType: FileDirType,
		file: Express.Multer.File
	): Promise<File> {
		const storage = this.storageService.getDefaultStorageInstance(instance);
		const storageFile = await storage.write(dirType, file);

		const savedFile = await prismaService.file.create({
			data: {
				id_storage: storageFile.id,
				storage_id: storage.data.id,
				dir_type: dirType,
				name: file.originalname,
				mime_type: file.mimetype,
				size: file.size,
			},
		});

		return savedFile;
	}

	public async deleteFile(id: number): Promise<void> {
		const file = await prismaService.file.findUniqueOrThrow({
			where: { id },
		});
		const storage = this.storageService.getStorageInstance(file.storage_id);

		await storage.delete(file);
		await prismaService.file.delete({ where: { id } });
	}

	public async getFileFromWabaMedia(
		instance: string,
		wabaMediaId: string
	): Promise<File> {
		const storage = this.storageService.getDefaultStorageInstance(instance);
		const storageFile = await storage.writeFromWabaMedia(wabaMediaId);
		const savedFile = await prismaService.file.create({
			data: {
				id_storage: storageFile.id,
				storage_id: storage.data.id,
				dir_type: FileDirType.public,
				name: storageFile.name,
				mime_type: storageFile.type,
				size: storageFile.size,
			},
		});

		return savedFile;
	}
}

export default new FilesService(storagesService);
