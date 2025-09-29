import StorageInstance from "../classes/storage-instance/storage-instance";
import { CreateStorageDTO, UpdateStorageDTO } from "../schemas/storage.schema";
import * as p from "@prisma/client";
import prismaService from "./prisma.service";
import ClientStorage from "../classes/storage-instance/client-storage-instance";
import ServerStorage from "../classes/storage-instance/server-storage-instance";
import axios from "axios";

class StorageService {
	private readonly storageInstances = new Map<number, StorageInstance>();
	private readonly defaultInstances = new Map<string, StorageInstance>();

	constructor() {
		this.loadInstances();
	}

	public async createStorage(data: CreateStorageDTO): Promise<p.Storage> {
		if (data.isDefault) {
			await this.resetDefaultStorage(data.instance);
		}

		const createdStorage = await prismaService.storage.create({
			data,
		});

		return createdStorage;
	}

	public async getStorageById(id: number): Promise<p.Storage> {
		const findStorage = await prismaService.storage.findUnique({
			where: { id },
		});

		if (!findStorage) {
			throw new Error(`Storage with id ${id} not found`);
		}

		return findStorage;
	}

	public async updateStorage(
		id: number,
		data: UpdateStorageDTO
	): Promise<p.Storage> {
		const storage = await this.getStorageById(id);

		if (data.isDefault) {
			await this.resetDefaultStorage(storage.instance);
		}

		const updatedStorage = await prismaService.storage.update({
			where: { id },
			data,
		});

		this.reloadInstance(updatedStorage);

		return updatedStorage;
	}

	public getDefaultStorageInstance(instance: string) {
		const findInstance = this.defaultInstances.get(instance);

		if (!findInstance) {
			throw new Error(`Default storage with instance ${instance} not found`);
		}

		return findInstance;
	}

	public getStorageInstance(id: number) {
		const findInstance = this.storageInstances.get(id);

		if (!findInstance) {
			throw new Error(`Storage with id ${id} not found`);
		}

		return findInstance;
	}

	private async loadInstances() {
		const storages = await prismaService.storage.findMany();

		for (const storage of storages) {
			const generatedStorage = this.generateInstance(storage);

			if (!!generatedStorage) {
				this.storageInstances.set(storage.id, generatedStorage);
			}
			if (!!generatedStorage && storage.is_default) {
				this.defaultInstances.set(storage.instance, generatedStorage);
			}
		}
	}

	private reloadInstance(storage: p.Storage) {
		const generatedStorage = this.generateInstance(storage);

		if (!!generatedStorage) {
			this.storageInstances.set(storage.id, generatedStorage);
		}
		if (!!generatedStorage && storage.is_default) {
			this.defaultInstances.set(storage.instance, generatedStorage);
		}
	}

	private generateInstance(storage: p.Storage) {
		switch (storage.type) {
			case "client":
				return this.createClientInstance(storage);
			case "server":
				return this.createServerInstance(storage);
			default:
				return null;
		}
	}

	private createServerInstance(storage: p.Storage) {
		const filesPath = process.env["FILES_PATH_TEMPLATE"]!;
		return new ServerStorage(storage, filesPath);
	}

	private createClientInstance(storage: p.Storage) {
		const ax = axios.create({
			baseURL: storage.client_url || "",
			timeout: storage.timeout || 10000,
			headers: {
				authorization: storage.token ?? "",
			},
		})

		return new ClientStorage(storage, ax);
	}

	private async resetDefaultStorage(instance: string): Promise<void> {
		await prismaService.storage.updateMany({
			where: {
				is_default: true,
				instance,
			},
			data: {
				is_default: false,
			},
		});
	}
}

export default new StorageService();
