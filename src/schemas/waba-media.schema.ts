import { z } from "zod";

export const getWabaMediaIdSchema = z.object({
	fileId: z.union([z.number(), z.string().trim().min(1)])
		.transform(Number)
		.pipe(z.number().int().positive().safe()),
	rejectedMediaId: z.string().trim().min(1).max(255).optional(),
});
