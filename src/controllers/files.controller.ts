import { Request, Response } from "express";
import filesService from "../services/files.service";
import Controller from "./controller";

class FilesController extends Controller {
	private readonly filesService = filesService;

	constructor() {
		super();

		this.router.get("/files/:id", this.getFile);
		this.router.post("/files", this.uploadFile);
	}

	public async getFile(req: Request, res: Response) {
		const { id } = req.params;
		const file = await this.filesService.getFile(Number(id));

		res.setHeader("Content-Type", file.mimeType);
		res.setHeader("Content-Length", file.size);
		res.setHeader(
			"Content-Disposition",
			`attachment; filename=${file.name}`
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

		const savedFile = await this.filesService.uploadFile(
			instance,
			dirType,
			file
		);

		res.status(201).send({
			message: "File uploaded successfully",
			data: savedFile,
		});
	}

	public async deleteFile(req: Request, res: Response) {
		const { id } = req.params;

		await this.filesService.deleteFile(Number(id));

		res.status(204).send();
	}
}

export default new FilesController();