import { File } from "@prisma/client";

class StoredFile {
	private _file: File;
	private _buffer: Buffer;

	constructor(file: File, buffer: Buffer) {
		this._file = file;
		this._buffer = buffer;
	}

	get model(): File {
		return this._file;
	}

	get name(): string {
		return this._file.name;
	}

	get mimeType(): string {
		return this._file.mime_type;
	}

	get size(): number {
		return this._file.size;
	}

	get buffer(): Buffer {
		return this._buffer;
	}
}

export default StoredFile;
