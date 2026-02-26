import { Request, Response } from "express";
import filesService from "../services/files.service";
import Controller from "./controller";
import upload from "../middlewares/multer.middleware";
import { BadRequestError } from "@rgranatodutra/http-errors";
import { Logger } from "@in.pulse-crm/utils";

class FilesController extends Controller {
	constructor() {
		super();

		this.router.get("/public/:instance/files/:publicId", this.getPublicFile);
		this.router.get("/api/files/exists", this.checkFileByHashAndInstance);
		this.router.get("/api/files/:id", this.getFile);
		this.router.get("/api/files/:id/view", this.viewFile);
		this.router.get("/api/files/:id/metadata", this.getFileMetadata);
		this.router.post("/api/files", upload.single("file"), this.uploadFile);
		this.router.delete("/api/files/:id", this.deleteFile);
		this.router.post("/api/waba", this.uploadWabaMedia);                     // Rota que recebe um mediaId e retorna o arquivo correspondente
		this.router.post("/api/waba/get-media-id", this.getWabaMediaIdFromFile); // Rota que recebe um fileId e retorna o mediaId correspondente
	}

	public async checkFileByHashAndInstance(req: Request, res: Response) {
		try {
			const hash = req.query["hash"];
			const instance = req.query["instance"];

			if (typeof hash !== "string" || !/^[a-fA-F0-9]{64}$/.test(hash)) {
				throw new BadRequestError(
					"query param hash must be a valid 64-character sha256 hash"
				);
			}

			if (typeof instance !== "string" || !instance.trim()) {
				throw new BadRequestError(
					"query param instance must be a non-empty string"
				);
			}

			const file = await filesService.getFileByHashAndInstance(
				hash,
				instance
			);

			res.status(200).send({
				message: "File lookup completed",
				data: {
					existis: !!file,
					file,
				},
			});
		} catch (error: any) {
			Logger.error("Error checking file by hash and instance", error);
			res.status(500).send({ message: "Internal server error", error });
		}
	}

	public async getFile(req: Request, res: Response) {
		try {
			const { id } = req.params;

			const numberId = Number(id);

			if (Number.isNaN(numberId)) {
				throw new BadRequestError("the url param id must be a number. provided: " + id);
			}

			const file = await filesService.getFile(numberId)

			Logger.info(`File with name ${file.name} downloaded`);

			res.setHeader("Content-Type", file.mimeType);
			res.setHeader("Content-Length", file.size);

			const inlineTypes = [
				"image/",
				"application/pdf",
				"text/plain",
				"text/html",
				"audio/",
				"video/"
			];

			const isInline = inlineTypes.some(type =>
				file.mimeType.startsWith(type)
			);

			res.setHeader(
				"Content-Disposition",
				isInline
					? `inline; filename="${encodeURIComponent(file.name)}"`
					: `attachment; filename="${encodeURIComponent(file.name)}"`
			);

			res.send(file.buffer);
		} catch (error: any) {
			Logger.error("Error fetching file", error);
			res.status(500).send({ message: "Internal server error", error });
		}
	}

	public async getPublicFile(req: Request, res: Response) {
		try {
			const { instance, publicId } = req.params;

			if (typeof instance !== "string" || !instance.trim()) {
				throw new BadRequestError(
					"the url param instance must be a non-empty string"
				);
			}

			if (typeof publicId !== "string" || !publicId.trim()) {
				throw new BadRequestError(
					"the url param publicId must be a non-empty string"
				);
			}

			const file = await filesService.getPublicFile(instance, publicId);

			const isInlineMedia =
				file.mimeType.startsWith("image/") ||
				file.mimeType === "application/pdf" ||
				file.mimeType.startsWith("video/") ||
				file.mimeType.startsWith("audio/");

			if (!isInlineMedia) {
				res.setHeader("Content-Type", file.mimeType);
				res.setHeader("Content-Length", file.size);

				const inlineTypes = [
					"image/",
					"application/pdf",
					"text/plain",
					"text/html",
					"audio/",
					"video/"
				];

				const isInline = inlineTypes.some(type =>
					file.mimeType.startsWith(type)
				);

				res.setHeader(
					"Content-Disposition",
					isInline
						? `inline; filename="${encodeURIComponent(file.name)}"`
						: `attachment; filename="${encodeURIComponent(file.name)}"`
				);

				res.send(file.buffer);
				return;
			}

			res.setHeader("Content-Type", file.mimeType);
			res.setHeader(
				"Content-Disposition",
				`inline; filename="${encodeURIComponent(file.name)}"`
			);

			const range = req.headers.range;

			if (
				(file.mimeType.startsWith("video/") ||
					file.mimeType.startsWith("audio/")) &&
				range
			) {
				const [startRaw, endRaw] = range.replace("bytes=", "").split("-");
				const start = Number(startRaw);
				const end = endRaw ? Number(endRaw) : file.size - 1;

				if (
					Number.isNaN(start) ||
					Number.isNaN(end) ||
					start < 0 ||
					end >= file.size ||
					start > end
				) {
					res.status(416).send({ message: "Invalid range" });
					return;
				}

				const chunk = file.buffer.subarray(start, end + 1);

				res.status(206);
				res.setHeader("Accept-Ranges", "bytes");
				res.setHeader("Content-Range", `bytes ${start}-${end}/${file.size}`);
				res.setHeader("Content-Length", chunk.length);
				res.send(chunk);
				return;
			}

			res.setHeader("Content-Length", file.size);
			res.send(file.buffer);

			Logger.info(`File with name ${file.name} rendered inline`);
		} catch (error: any) {
			Logger.error("Error rendering file inline", error);
			res.status(500).send({ message: "Internal server error", error });
		}
	}

	public async getFileMetadata(req: Request, res: Response) {
		try {
			const { id } = req.params;

			if (Number.isNaN(+id!)) {
				throw new BadRequestError(
					"the url param id must be a number. provided: " + id
				);
			}

			const fileMetadata = await filesService.getFileMetadata(+id!);

			Logger.info(`File metadata for id ${id} fetched successfully`);

			res.status(200).send({
				message: "File metadata fetched successfully",
				data: fileMetadata,
			});
		} catch (error: any) {
			Logger.error("Error fetching file metadata", error);
			res.status(500).send({ message: "Internal server error", error });
		}
	}

	public async viewFile(req: Request, res: Response) {
		try {
			const { id } = req.params;

			if (Number.isNaN(+id!)) {
				throw new BadRequestError(
					"the url param id must be a number. provided: " + id
				);
			}

			const file = await filesService.getFile(+id!);
			const isInlineMedia =
				file.mimeType.startsWith("image/") ||
				file.mimeType === "application/pdf" ||
				file.mimeType.startsWith("video/") ||
				file.mimeType.startsWith("audio/");

			if (!isInlineMedia) {
				this.getFile(req, res);
				return;
			}

			res.setHeader("Content-Type", file.mimeType);
			res.setHeader(
				"Content-Disposition",
				`inline; filename="${encodeURIComponent(file.name)}"`
			);

			const range = req.headers.range;

			if (
				(file.mimeType.startsWith("video/") ||
					file.mimeType.startsWith("audio/")) &&
				range
			) {
				const [startRaw, endRaw] = range.replace("bytes=", "").split("-");
				const start = Number(startRaw);
				const end = endRaw ? Number(endRaw) : file.size - 1;

				if (
					Number.isNaN(start) ||
					Number.isNaN(end) ||
					start < 0 ||
					end >= file.size ||
					start > end
				) {
					res.status(416).send({ message: "Invalid range" });
					return;
				}

				const chunk = file.buffer.subarray(start, end + 1);

				res.status(206);
				res.setHeader("Accept-Ranges", "bytes");
				res.setHeader("Content-Range", `bytes ${start}-${end}/${file.size}`);
				res.setHeader("Content-Length", chunk.length);
				res.send(chunk);
				return;
			}

			res.setHeader("Content-Length", file.size);
			res.send(file.buffer);

			Logger.info(`File with name ${file.name} rendered inline`);
		} catch (error: any) {
			Logger.error("Error rendering file inline", error);
			res.status(500).send({ message: "Internal server error", error });
		}
	}

	public async uploadFile(req: Request, res: Response) {
		const { instance, dirType } = req.body;

		if (!instance || !dirType) {
			res.status(400).send({
				message: "Instance and dirType fields are required",
			});
			return;
		}

		const file = req.file;

		if (!file) {
			res.status(400).send({ message: "File field is required" });
			return;
		}

		const savedFile = await filesService.uploadFile(
			instance,
			dirType,
			file
		);

		Logger.info(`File with name ${file.originalname} uploaded`);

		res.status(201).send({
			message: "File uploaded successfully",
			data: savedFile,
		});
	}

	public async deleteFile(req: Request, res: Response) {
		const { id } = req.params;

		await filesService.deleteFile(Number(id));

		Logger.info(`File with id ${id} deleted`);

		res.status(204).send();
	}

	public async uploadWabaMedia(req: Request, res: Response) {
		const { instance, wabaMediaId } = req.body;

		const isInstanceString = typeof instance === "string";
		const isWabaMediaIdString = typeof wabaMediaId === "string";

		if (!isInstanceString || !isWabaMediaIdString) {
			res.status(400).send({
				message: "Instance and wabaMediaId fields are required",
			});
			return;
		}

		try {
			const savedFile = await filesService.getFileFromWabaMedia(
				instance as string,
				wabaMediaId as string
			);
			res.status(201).send({
				message: "File fetched successfully",
				data: savedFile,
			});
			Logger.info(
				`File with name ${savedFile.name} from wabaMediaId ${wabaMediaId} fetched`
			);
		} catch (error: any) {
			Logger.error("Error fetching file from WABA media", error);
			res.status(500).send({ message: "Internal server error", error });
			return;
		}
	}

	public async getWabaMediaIdFromFile(req: Request, res: Response) {
		const fileId = Number(req.body.fileId);

		if (typeof fileId !== "number" || Number.isNaN(fileId)) {
			res.status(400).send({
				message: "fileId field is required and must be a number",
			});
			return;
		}

		try {
			const mediaId = await filesService.getWabaMediaIdFromFile(fileId);
			res.status(200).send({
				message: "Media id fetched successfully",
				data: {
					mediaId,
				},
			});
			Logger.info(`Media id fetched from file id ${fileId}`);
		} catch (error: any) {
			Logger.error("Error fetching media id from file", error);
			res.status(500).send({ message: "Internal server error", error });
			return;
		}
	}
}

export default new FilesController();
