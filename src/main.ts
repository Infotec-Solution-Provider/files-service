import "dotenv/config";
import express, { NextFunction, Request, Response } from "express";
import cors from "cors";
import filesController from "./controllers/files.controller";
import { Logger } from "@in.pulse-crm/utils";

const app = express();
const ROUTE_PREFIX = "/api";

app.use(cors());
app.use(express.json());

app.use(ROUTE_PREFIX, filesController.routes);

app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
	Logger.error("Internal server error", err);
	res.status(500).send({ message: "Internal server error", cause: err });
});

const LISTEN_PORT = Number(process.env["LISTEN_PORT"]) || 8003;

app.listen(LISTEN_PORT, () => {
	console.log("Server is running on port ", LISTEN_PORT);
});
