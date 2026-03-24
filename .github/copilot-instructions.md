# Copilot Instructions for `files-service`

## Purpose
`files-service` is the **centralised file storage service** for the In.pulse CRM platform, primarily handling message files and other media. It manages storage backends per tenant and tracks file metadata in its own MySQL database via Prisma.

There are two types of storage backend:
- **`server` type**: files are stored locally on the same server as `files-service`.
- **`client` type**: `files-service` delegates storage to a `storage-client` instance via HTTP API, leaving the responsibility of physically saving files with that sub-service.

It also performs audio conversion with `fluent-ffmpeg` and exposes a unified REST API consumed by other services (e.g. `whatsapp-service`).

## Tech Stack
| Concern | Choice |
|---|---|
| Runtime | Node.js + TypeScript 5 |
| Framework | Express 4 |
| ORM | Prisma 6 (`@prisma/client`) |
| Database | MySQL (`FILES_DATABASE_URL`) |
| Validation | Zod |
| File upload | Multer (memory storage, no disk temp) |
| Audio conversion | fluent-ffmpeg |
| HTTP client | Axios (for `client`-type storage and WABA calls) |
| Shared libs | `@in.pulse-crm/sdk`, `@in.pulse-crm/utils` |

## Folder Structure (`src/`)
```
src/
├── main.ts                          # Bootstrap: Express, CORS, single controller mount, fileCleanupService.start()
├── controllers/
│   ├── controller.ts                # Abstract base: exposes this.router (mergeParams Router)
│   └── files.controller.ts          # All routes registered here; thin request/response layer only
├── services/
│   ├── prisma.service.ts            # Singleton PrismaClient export
│   ├── files.service.ts             # Core file business logic (upload, read, hash-dedup, WABA)
│   ├── storages.service.ts          # Manages StorageInstance map; creates/reads/updates Storage records
│   ├── file-cleanup.service.ts      # Background timer: deletes stale files past retention window
│   └── convert-audio.service.ts     # Converts audio buffers via fluent-ffmpeg
├── classes/
│   ├── stored-file.ts               # Value object wrapping a Prisma File + Buffer
│   └── storage-instance/
│       ├── storage-instance.ts      # Abstract base for storage backends
│       ├── server-storage-instance.ts # Reads/writes to local filesystem paths
│       └── client-storage-instance.ts # Delegates read/write to a remote storage-client over HTTP
├── middlewares/
│   ├── multer.middleware.ts         # Multer (memory) singleton for multipart uploads
│   └── validate-schema.middleware.ts # Zod schema validation helper
└── schemas/
    └── storage.schema.ts            # Zod schemas + DTOs for Storage CRUD
```

## API Endpoints
All routes are registered in `FilesController`. No authentication middleware is applied at the service level — callers are trusted internal services or the frontend via API gateway.

| Method | Path | Description |
|---|---|---|
| `GET` | `/public/:instance/files/:publicId` | Serve a file by its NanoID public identifier (unauthenticated CDN-style) |
| `GET` | `/api/files/exists` | Check if a file exists by `?hash=<sha256>&instance=<instance>` |
| `GET` | `/api/files/:id` | Download file by numeric DB id (sets Content-Disposition based on MIME) |
| `GET` | `/api/files/:id/view` | View/stream file inline; supports `Range` header for audio/video |
| `GET` | `/api/files/:id/metadata` | Return Prisma `File` record as JSON |
| `POST` | `/api/files` | Upload a file (`multipart/form-data`, field `file`); requires `instance` and `dirType` from body/query |
| `DELETE` | `/api/files/:id` | Delete file from storage backend and DB |
| `POST` | `/api/waba` | Fetch WABA (WhatsApp Business API) media by `mediaId` and store it |
| `POST` | `/api/waba/get-media-id` | Return the WABA `mediaId` associated with a stored file |

### Response shape (success)
```json
{ "message": "...", "data": { ... } }
```
Errors use `{ "message": "...", "error": ... }` plus appropriate HTTP status codes. `BadRequestError` from `@rgranatodutra/http-errors` is used for input validation failures.

## Build / Dev Commands
```bash
npm run dev       # ts-node-dev --transpile-only --respawn (src/main.ts) — for local development
npm run build     # tsc — compiles to dist/
npm start         # node dist/main.js — runs compiled output in production
```
> There is no test suite; validate changes with targeted runtime logs.

## Environment Variables
| Variable | Purpose |
|---|---|
| `LISTEN_PORT` | HTTP port (default: `8003`) |
| `FILES_DATABASE_URL` | MySQL connection string for Prisma |
| `FILES_CLEANUP_RETENTION_MONTHS` | How many months to retain files (default: `6`) |
| `FILES_CLEANUP_INTERVAL_HOURS` | How often cleanup runs (default: `24` hours) |

Storage backends of type `client` use their own `client_url` / `token` stored in the `storages` DB table — **no additional env var** is needed per client storage.

## Inter-Service Communication
- **`storage-client` service**: `ClientStorageInstance` uses Axios to call the remote service's REST API (`/api/storage/`). The `client_url` and optional `token` are stored in the `Storage` DB record.
- **`whatsapp-service`** (and others): consume this service's REST API to upload/download files.
- The shared `@in.pulse-crm/sdk` and `@in.pulse-crm/utils` packages provide common utilities and the API client for other services.

## Prisma Schema Overview
```
Storage (storages)
  id, instance (whatsapp instance name), type (server|client),
  client_url, timeout, token, is_default
  → has many File

File (files)
  id, public_id (NanoID 21, unique), id_storage (path/UUID in backend),
  name, mime_type, size, content_hash (SHA-256, nullable),
  dir_type (public|models), storage_id (FK → Storage),
  created_at, last_accessed_at, waba_media_id
  → unique index on (storage_id, dir_type, content_hash) for deduplication
```
**Key design:** files are content-hash deduplicated per `(storage_id, dir_type)`. Before writing, `filesService` checks for an existing matching hash and reuses the record.

## Code Conventions
- **Singleton service exports**: every service file exports `export default new XxxService()`.
- **Controller pattern**: `FilesController extends Controller` — constructor registers all routes via `this.router.*`, methods are `public async`. Only one controller exists; no router nesting.
- **Strict TypeScript**: all `compilerOptions` are maximally strict (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, etc.). Avoid `any`; use `unknown` in catch blocks.
- **Module resolution**: `NodeNext` — use `.js` extensions in relative imports when required by the TypeScript config.
- **Naming**: `camelCase` for variables/methods, `PascalCase` for classes, `kebab-case` for filenames (e.g. `files.service.ts`, `server-storage-instance.ts`).
- **No auth middleware** in this service: callers are assumed to be internal.
- **Logging**: use `Logger` from `@in.pulse-crm/utils` (`Logger.info`, `Logger.error`).
- **Validation**: use Zod schemas in `src/schemas/` and the `validateSchema` middleware; never trust raw request body without a schema type guard.

## Critical Invariants
- Do **not** bypass the `StorageInstance` abstraction when adding backend-specific behavior. New storage types must extend `StorageInstance` and be registered in `StorageService`.
- `FileCleanupService.start()` is called from `main.ts` after the server starts — preserve this side effect.
- Content-hash deduplication logic in `filesService.uploadFile` prevents re-storing identical files per storage+dir. Keep this check when modifying upload flow.
- `public_id` is a NanoID (21 chars) generated by Prisma `@default(nanoid(21))`; it is the public-safe identifier for unauthenticated file access. Never expose the numeric `id` in public-facing URLs.
