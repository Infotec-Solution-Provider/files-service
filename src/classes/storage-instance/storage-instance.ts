import { File, FileDirType, Storage } from "@prisma/client";

abstract class StorageInstance {
	abstract write(
		dirType: FileDirType,
		file: Express.Multer.File
	): Promise<{ id: string }>;
	abstract read(file: File): Promise<Buffer>;
	abstract delete(file: File): Promise<void>;
	abstract writeFromWabaMedia(wabaMediaId: string): Promise<{ id: string; name: string; type: string; size: number; date: string }>;

	abstract get instance(): string;
	abstract get data(): Storage;
}

export default StorageInstance;
