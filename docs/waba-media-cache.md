# WABA media cache

`POST /api/waba/get-media-id` still accepts `{ "fileId": 501017 }` and returns
`{ "data": { "mediaId": "..." } }` (plus the existing response message). The new
optional `rejectedMediaId` is the exact ID rejected by Meta. A caller must only
use it after an explicit invalid-media rejection, never after a timeout or an
unknown message-delivery result.

The cache expires 27 days after the upload began. An ID without
`waba_media_uploaded_at` is uploaded again on its next use. Do not backfill this
column using `files.created_at`: that records file creation, not the Meta upload.
Rejections refresh even young IDs. If another request has already stored a fresh
replacement, that replacement is reused. Concurrent requests in one process share
the upload; conditional database updates prevent a slower process from overwriting
a cache another process already replaced. Concurrent processes may upload twice;
this endpoint only uploads media and never sends a WhatsApp message.

An upload failure does not return an expired/rejected ID as a successful result.
No historical messages are resent or reclassified by this change.

## Deployment order

1. Install the locked dependencies for files-service (`npm ci` or
   `pnpm install --frozen-lockfile`, according to the deployment's package manager).
2. Apply the additive migration in the **files database** with
   `npx prisma migrate deploy`. The nullable column is compatible with the old
   service. Apply it before starting the new service, because generated Prisma
   queries select the new field.
3. Run `npx prisma generate`, then `npm test` (includes the TypeScript build).
4. Restart the files-service PM2 application using its deployed application name
   and `--update-env`.
5. Deploy/restart the matching whatsapp-service change that sends
   `rejectedMediaId` only after a confirmed invalid-media rejection.

The first reuse of each legacy cached file incurs a media upload. There is no
bulk migration upload or mass cache reset. After deployment, validate one real
official WhatsApp media send and its final status; local tests use a fake upload
and an in-memory cache store and do not verify Meta, MySQL, storage-client or PM2.
