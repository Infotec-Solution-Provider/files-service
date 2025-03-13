import "dotenv/config";
import express, { NextFunction, Request, Response } from "express";
import cors from "cors";
import filesController from "./controllers/files.controller";
import { Logger } from "@in.pulse-crm/utils";
//import { Logger } from "@in.pulse-crm/utils";

const app = express();
const ROUTE_PREFIX = "/api";

app.use(cors());
app.use(express.json());

app.use(ROUTE_PREFIX, filesController.routes);

app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
	Logger.error("Internal server error", err);
	res.status(500).send({ message: "Internal server error", cause: err });
});

app.listen(Number(process.env["SERVER_PORT"]) || 6000, () => {
	console.log("Server is running on port 6000");
});
