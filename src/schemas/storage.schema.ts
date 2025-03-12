import { FileStorageType } from "@prisma/client";
import { z } from "zod";

export const createStorageSchema = z.object({
	instance: z.string(),
	type: z.nativeEnum(FileStorageType),
	details: z.object({
		url: z.string().url(),
	}),
    isDefault: z.boolean()
});

export const updateStorageSchema = createStorageSchema.partial();

export type CreateStorageDTO = z.infer<typeof createStorageSchema>;
export type UpdateStorageDTO = Partial<CreateStorageDTO>;