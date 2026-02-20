import { Logger } from "@in.pulse-crm/utils";
import { FileStorageType } from "@prisma/client";
import prismaService from "./prisma.service";
import storagesService from "./storages.service";

class FileCleanupService {
	private readonly storageService: typeof storagesService;
	private timer?: NodeJS.Timeout;
	private isRunning = false;

	constructor(storageService: typeof storagesService) {
		this.storageService = storageService;
	}

	public start(): void {
		if (this.timer) {
			return;
		}

		const intervalMs = this.getIntervalMs();

		void this.runCleanup();
		this.timer = setInterval(() => {
			void this.runCleanup();
		}, intervalMs);
	}

	private getRetentionMonths(): number {
		const rawValue = Number(process.env["FILES_CLEANUP_RETENTION_MONTHS"] ?? 6);

		if (!Number.isFinite(rawValue) || rawValue <= 0) {
			return 6;
		}

		return Math.floor(rawValue);
	}

	private getIntervalMs(): number {
		const rawValue = Number(process.env["FILES_CLEANUP_INTERVAL_HOURS"] ?? 24);

		if (!Number.isFinite(rawValue) || rawValue <= 0) {
			return 24 * 60 * 60 * 1000;
		}

		return Math.floor(rawValue * 60 * 60 * 1000);
	}

	private getCutoffDate(): Date {
		const retentionMonths = this.getRetentionMonths();
		const cutoffDate = new Date();

		cutoffDate.setMonth(cutoffDate.getMonth() - retentionMonths);

		return cutoffDate;
	}

	private async runCleanup(): Promise<void> {
		if (this.isRunning) {
			return;
		}

		this.isRunning = true;

		try {
			const cutoffDate = this.getCutoffDate();
			let totalDeleted = 0;
			let totalFailed = 0;

			const maxCutoffDate = new Date('2026-02-19');

			if (cutoffDate > maxCutoffDate) {
				Logger.info(
					`Calculated cutoff date ${cutoffDate.toISOString()} is too far in the past. Adjusting to ${maxCutoffDate.toISOString()}.`
				);
				return;
			}

			while (true) {
				const expiredFiles = await prismaService.file.findMany({
					where: {
						created_at: { lte: cutoffDate },
						storage: {
							type: FileStorageType.server,
						},
					},
					orderBy: { id: "asc" },
					take: 200,
				});

				if (!expiredFiles.length) {
					break;
				}

				for (const file of expiredFiles) {
					try {
						const storage = this.storageService.getStorageInstance(file.storage_id);
						await storage.delete(file);
					} catch (error) {
						if (!this.isFileNotFoundError(error)) {
							totalFailed++;
							Logger.error(
								`Error deleting local file ${file.id} from storage ${file.storage_id}`,
								this.toError(error)
							);
							continue;
						}
					}

					await prismaService.file.delete({ where: { id: file.id } });
					totalDeleted++;
				}
			}

			if (totalDeleted > 0 || totalFailed > 0) {
				Logger.info(
					`Files cleanup finished. Deleted: ${totalDeleted}, Failed: ${totalFailed}, Retention: ${this.getRetentionMonths()} months`
				);
			}
		} catch (error) {
			Logger.error("Error running files cleanup", this.toError(error));
		} finally {
			this.isRunning = false;
		}
	}

	private toError(error: unknown): Error {
		if (error instanceof Error) {
			return error;
		}

		return new Error(String(error));
	}

	private isFileNotFoundError(error: unknown): boolean {
		if (!error || typeof error !== "object") {
			return false;
		}

		if (!("code" in error)) {
			return false;
		}

		return (error as { code?: string }).code === "ENOENT";
	}
}

export default new FileCleanupService(storagesService);