import { Request, Response } from "express";
import filesService from "../services/files.service";
import Controller from "./controller";
import upload from "../middlewares/multer.middleware";
import { BadRequestError } from "@rgranatodutra/http-errors";
import { Logger } from "@in.pulse-crm/utils";

class FilesController extends Controller {
	constructor() {
		super();

		this.router.get("/files/:id", this.getFile);
		this.router.post("/files", upload.single("file"), this.uploadFile);
		this.router.delete("/files/:id", this.deleteFile);
	}

	public async getFile(req: Request, res: Response) {
		const { id } = req.params;

		if (Number.isNaN(+id!)) {
			throw new BadRequestError(
				"the url param id must be a number. provided: " + id
			);
		}

		const file = await filesService.getFile(+id!);

		Logger.info(`File with name ${file.name} downloaded`);

		res.setHeader("Content-Type", file.mimeType);
		res.setHeader("Content-Length", file.size);
		res.setHeader(
			"Content-Disposition",
			`attachment; filename="${encodeURIComponent(file.name)}"`
		);

		res.send(file.buffer);
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
}

export default new FilesController();
