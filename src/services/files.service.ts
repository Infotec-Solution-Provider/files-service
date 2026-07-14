import { createHash, randomUUID } from "node:crypto";
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { Readable } from "node:stream";
import { File, FileDirType, Prisma } from "@prisma/client";
import StoredFile from "../classes/stored-file";
import prismaService from "./prisma.service";
import storagesService from "./storages.service";
import WhatsappAudioConverter from "./convert-audio.service";
import { createUploadTraceLogger } from "../utils/file-upload-trace";

interface ChunkUploadSessionMetadata {
	instance: string;
	dirType: FileDirType;
	fileName: string;
	fileType: string;
	totalSize: number;
	totalChunks: number;
	contentHash?: string;
	createdAt: string;
}

class FilesService {
	private readonly storageService: typeof storagesService;
	private readonly chunkUploadRootDir = join(tmpdir(), "infotec-files-service-chunks");

	constructor(storageService: typeof storagesService) {
		this.storageService = storageService;
	}

	private generateFileHash(fileBuffer: Buffer): string {
		return createHash("sha256").update(fileBuffer).digest("hex");
	}

	private getChunkUploadDir(uploadId: string): string {
		return join(this.chunkUploadRootDir, uploadId);
	}

	private getChunkMetadataPath(uploadId: string): string {
		return join(this.getChunkUploadDir(uploadId), "metadata.json");
	}

	private async readChunkMetadata(uploadId: string): Promise<ChunkUploadSessionMetadata> {
		const metadataPath = this.getChunkMetadataPath(uploadId);
		const raw = await readFile(metadataPath, "utf-8");
		return JSON.parse(raw) as ChunkUploadSessionMetadata;
	}

	private async removeChunkUploadDir(uploadId: string): Promise<void> {
		await rm(this.getChunkUploadDir(uploadId), { recursive: true, force: true });
	}

	public async createChunkUploadSession(input: {
		instance: string;
		dirType: FileDirType;
		fileName: string;
		fileType: string;
		totalSize: number;
		totalChunks: number;
		contentHash?: string;
		traceId?: string;
	}): Promise<{ uploadId: string }> {
		const uploadId = randomUUID();
		const uploadDir = this.getChunkUploadDir(uploadId);
		const trace = createUploadTraceLogger("files-service.service.chunk.init", input.traceId || uploadId);

		await mkdir(uploadDir, { recursive: true });

		const metadata: ChunkUploadSessionMetadata = {
			instance: input.instance,
			dirType: input.dirType,
			fileName: input.fileName,
			fileType: input.fileType,
			totalSize: input.totalSize,
			totalChunks: input.totalChunks,
			...(input.contentHash ? { contentHash: input.contentHash } : {}),
			createdAt: new Date().toISOString(),
		};

		await writeFile(this.getChunkMetadataPath(uploadId), JSON.stringify(metadata), "utf-8");

		trace.info("chunk.init.success", {
			uploadId,
			instance: input.instance,
			dirType: input.dirType,
			fileName: input.fileName,
			fileType: input.fileType,
			totalSize: input.totalSize,
			totalChunks: input.totalChunks,
			hasContentHash: !!input.contentHash,
		});

		return { uploadId };
	}

	public async uploadChunk(
		uploadId: string,
		chunkIndex: number,
		totalChunks: number,
		chunk: Express.Multer.File,
		traceId?: string,
	): Promise<{ receivedChunks: number; totalChunks: number }> {
		const trace = createUploadTraceLogger("files-service.service.chunk.upload", traceId || uploadId);
		const metadata = await this.readChunkMetadata(uploadId);

		if (metadata.totalChunks !== totalChunks) {
			throw new Error("totalChunks mismatch for chunk upload session");
		}

		const chunkPath = join(this.getChunkUploadDir(uploadId), `${chunkIndex}.part`);
		await writeFile(chunkPath, chunk.buffer);

		const files = await readdir(this.getChunkUploadDir(uploadId));
		const receivedChunks = files.filter((fileName) => fileName.endsWith(".part")).length;

		trace.info("chunk.uploaded", {
			uploadId,
			chunkIndex,
			totalChunks,
			receivedChunks,
			chunkSize: chunk.size,
		});

		return {
			receivedChunks,
			totalChunks,
		};
	}

	public async completeChunkUpload(uploadId: string, traceId?: string): Promise<File> {
		const trace = createUploadTraceLogger("files-service.service.chunk.complete", traceId || uploadId);
		const metadata = await this.readChunkMetadata(uploadId);
		const buffers: Buffer[] = [];

		for (let index = 0; index < metadata.totalChunks; index++) {
			const chunkPath = join(this.getChunkUploadDir(uploadId), `${index}.part`);
			const chunkBuffer = await readFile(chunkPath);
			buffers.push(chunkBuffer);
		}

		const mergedBuffer = Buffer.concat(buffers);

		if (mergedBuffer.length !== metadata.totalSize) {
			trace.error("chunk.complete.invalid-size", new Error("Merged chunk size mismatch"), {
				uploadId,
				expectedSize: metadata.totalSize,
				actualSize: mergedBuffer.length,
			});
			throw new Error("Merged chunk size does not match original file size");
		}

		const mergedFile: Express.Multer.File = {
			fieldname: "file",
			originalname: metadata.fileName,
			encoding: "7bit",
			mimetype: metadata.fileType,
			size: mergedBuffer.length,
			buffer: mergedBuffer,
			destination: "",
			filename: metadata.fileName,
			path: "",
			stream: Readable.from(mergedBuffer),
		};

		const savedFile = await this.uploadFile(
			metadata.instance,
			metadata.dirType,
			mergedFile,
			metadata.contentHash,
			traceId,
		);

		await this.removeChunkUploadDir(uploadId);

		trace.info("chunk.complete.success", {
			uploadId,
			fileId: savedFile.id,
			fileSize: savedFile.size,
			storageId: savedFile.storage_id,
		});

		return savedFile;
	}

	public async getFile(id: number): Promise<StoredFile> {
		const file = await prismaService.file.findUniqueOrThrow({
			where: { id },
		});
		const storage = this.storageService.getStorageInstance(file.storage_id);
		const buffer = await storage.read(file);

		// Update last accessed timestamp (non-blocking)
		void this.updateLastAccessed(id);

		return new StoredFile(file, buffer);
	}

	public async getPublicFile(_instance: string, publicId: string): Promise<StoredFile> {
		const file = await prismaService.file.findFirstOrThrow({
			where: {
				public_id: publicId,
			},
		});
		const storage = this.storageService.getStorageInstance(file.storage_id);
		const buffer = await storage.read(file);

		// Update last accessed timestamp (non-blocking)
		void this.updateLastAccessed(file.id);

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
		file: Express.Multer.File,
		providedContentHash?: string,
		traceId?: string,
	): Promise<File> {
		const resolvedTraceId = traceId || `files-${instance}-${Date.now()}`;
		const trace = createUploadTraceLogger("files-service.service.upload", resolvedTraceId);
		const storage = this.storageService.getDefaultStorageInstance(instance);
		trace.info("upload.start", {
			instance,
			dirType,
			fileName: file.originalname,
			fileSize: file.size,
			fileType: file.mimetype,
			storageId: storage.data.id,
			storageType: storage.data.type,
		});
		const normalizedProvidedHash = providedContentHash?.trim().toLowerCase();
		const hasValidProvidedHash =
			typeof normalizedProvidedHash === "string" &&
			/^[a-f0-9]{64}$/.test(normalizedProvidedHash);

		const contentHash = hasValidProvidedHash
			? normalizedProvidedHash
			: this.generateFileHash(file.buffer);
		trace.info("hash.resolved", {
			hashSource: hasValidProvidedHash ? "client" : "server",
			contentHash,
		});
		const existingFile = await prismaService.file.findFirst({
			where: {
				storage_id: storage.data.id,
				dir_type: dirType,
				content_hash: contentHash,
			},
		});

		if (existingFile) {
			trace.info("dedupe.hit", {
				fileId: existingFile.id,
				storageId: existingFile.storage_id,
			});
			return existingFile;
		}
		trace.info("dedupe.miss", { storageId: storage.data.id });

		if (file.mimetype.startsWith("audio/")) {
			trace.info("audio-convert.start", {
				fileName: file.originalname,
				fileType: file.mimetype,
			});
			const converted = await WhatsappAudioConverter.convertToCompatible(file.buffer, file.mimetype);
			file.buffer = converted.buffer;
			file.mimetype = converted.mimeType;
			file.originalname = file.originalname.replace(/\.[^/.]+$/, `.${converted.extension}`);
			trace.info("audio-convert.success", {
				convertedSize: converted.size,
				convertedMimeType: converted.mimeType,
				convertedExtension: converted.extension,
			});
		}

		trace.info("storage.write.start", {
			storageId: storage.data.id,
			storageType: storage.data.type,
		});
		const storageFile = await storage.write(dirType, file);
		trace.info("storage.write.success", {
			storageFileId: storageFile.id,
		});

		try {
			trace.info("db.create.start", {
				storageFileId: storageFile.id,
				contentHash,
			});
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
			trace.info("db.create.success", {
				fileId: savedFile.id,
				storageId: savedFile.storage_id,
			});

			return savedFile;
		} catch (error) {
			if (
				error instanceof Prisma.PrismaClientKnownRequestError &&
				error.code === "P2002"
			) {
				trace.info("db.create.conflict", {
					storageFileId: storageFile.id,
					contentHash,
				});
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
					last_accessed_at: null,
					waba_media_id: null,
				});

				const deduplicatedFile = await prismaService.file.findFirstOrThrow({
					where: {
						storage_id: storage.data.id,
						dir_type: dirType,
						content_hash: contentHash,
					},
				});
				trace.info("dedupe.recovered", {
					fileId: deduplicatedFile.id,
					storageId: deduplicatedFile.storage_id,
				});

				return deduplicatedFile;
			}
			trace.error("upload.failed", error, {
				instance,
				fileName: file.originalname,
				contentHash,
			});

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

	public async getWabaMediaIdFromFile(id: number): Promise<string> {
		const file = await prismaService.file.findUniqueOrThrow({
			where: { id },
		});

		if (file.waba_media_id) {
			return file.waba_media_id;
		}

		const storage = this.storageService.getStorageInstance(file.storage_id);
		const mediaId = await storage.getMediaFromFileId(file.id_storage);

		if (mediaId) {
			await prismaService.file.update({
				where: { id },
				data: { waba_media_id: mediaId },
			});
		}

		return mediaId;
	}

	private async updateLastAccessed(id: number): Promise<void> {
		try {
			await prismaService.file.update({
				where: { id },
				data: { last_accessed_at: new Date() },
			});
		} catch (error) {
			// Silent fail - don't disrupt file access if tracking fails
		}
	}
}

export default new FilesService(storagesService);
