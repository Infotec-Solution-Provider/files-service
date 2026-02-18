import { createHash } from "node:crypto";
import { File, FileDirType, Prisma } from "@prisma/client";
import StoredFile from "../classes/stored-file";
import prismaService from "./prisma.service";
import storagesService from "./storages.service";

class FilesService {
	private readonly storageService: typeof storagesService;

	constructor(storageService: typeof storagesService) {
		this.storageService = storageService;
	}

	private generateFileHash(fileBuffer: Buffer): string {
		return createHash("sha256").update(fileBuffer).digest("hex");
	}

	public async getFile(id: number): Promise<StoredFile> {
		const file = await prismaService.file.findUniqueOrThrow({
			where: { id },
		});
		const storage = this.storageService.getStorageInstance(file.storage_id);
		const buffer = await storage.read(file);

		return new StoredFile(file, buffer);
	}

	public async getPublicFile(publicId: string): Promise<StoredFile> {
		const file = await prismaService.file.findFirstOrThrow({
			where: {
				public_id: publicId,
				dir_type: FileDirType.public,
			},
		});
		const storage = this.storageService.getStorageInstance(file.storage_id);
		const buffer = await storage.read(file);

		return new StoredFile(file, buffer);
	}

	public async getFileMetadata(id: number): Promise<File> {
		const file = await prismaService.file.findUniqueOrThrow({
			where: { id },
		});

		return file;
	}

	public async getFileByHashAndInstance(
		contentHash: string,
		instance: string
	): Promise<File | null> {
		const file = await prismaService.file.findFirst({
			where: {
				content_hash: contentHash,
				storage: {
					instance,
				},
			},
			orderBy: {
				id: "desc",
			},
		});

		return file ?? null;
	}

	public async uploadFile(
		instance: string,
		dirType: FileDirType,
		file: Express.Multer.File
	): Promise<File> {
		const storage = this.storageService.getDefaultStorageInstance(instance);
		const contentHash = this.generateFileHash(file.buffer);
		const existingFile = await prismaService.file.findFirst({
			where: {
				storage_id: storage.data.id,
				dir_type: dirType,
				content_hash: contentHash,
			},
		});

		if (existingFile) {
			return existingFile;
		}

		const storageFile = await storage.write(dirType, file);

		try {
			const savedFile = await prismaService.file.create({
				data: {
					id_storage: storageFile.id,
					storage_id: storage.data.id,
					dir_type: dirType,
					name: file.originalname,
					mime_type: file.mimetype,
					size: file.size,
					content_hash: contentHash,
				},
			});

			return savedFile;
		} catch (error) {
			if (
				error instanceof Prisma.PrismaClientKnownRequestError &&
				error.code === "P2002"
			) {
				await storage.delete({
					id: 0,
					public_id: "",
					id_storage: storageFile.id,
					name: file.originalname,
					mime_type: file.mimetype,
					size: file.size,
					dir_type: dirType,
					storage_id: storage.data.id,
					created_at: new Date(),
					content_hash: contentHash,
				});

				const deduplicatedFile = await prismaService.file.findFirstOrThrow({
					where: {
						storage_id: storage.data.id,
						dir_type: dirType,
						content_hash: contentHash,
					},
				});

				return deduplicatedFile;
			}

			throw error;
		}
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
