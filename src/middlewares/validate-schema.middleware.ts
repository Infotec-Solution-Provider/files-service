import { ZodObject } from "zod";
import { Request, Response, NextFunction } from "express";

function validateSchema(
	validate: "body" | "query" | "params",
	schema: ZodObject<any>
) {
	return function (req: Request, res: Response, next: NextFunction) {
		const result = schema.safeParse(req[validate]);

		if (result.error) {
			res.status(400).json({
				message: `Invalid request ${validate}`,
				error: result.error.errors,
			});
		} else {
			next();
		}
	};
}

export default validateSchema;
