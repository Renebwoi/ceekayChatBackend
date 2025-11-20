# Attachment Download Flow

This document captures the mechanics behind the secure attachment delivery work.

## Objectives

- Expose a REST endpoint that returns a time-limited Backblaze B2 download URL for a stored attachment.
- Reuse existing course membership checks so only authorised users (students, lecturers, admins) can fetch attachments.
- Reflect the new download surface in every message payload so API consumers know where to retrieve the signed URL.

## Backblaze integration updates

- `src/lib/b2.ts`
  - The helper now persists the `downloadUrl` returned by `authorize()` so subsequent calls can build direct file URLs.
  - Bucket name autodetection: derived from `B2_PUBLIC_BASE_URL` (expects the standard `https://.../file/<bucket>` layout). We fail fast if the pattern does not match.
  - `getSignedDownloadUrl(name, expiresInSeconds?)`
    - Refreshes credentials when necessary, requests a download authorisation token scoped to the exact file, and builds the signed URL.
    - Expires the link after, at most, 60 minutes (default: 60 seconds). Values less than a second get promoted to one second.

## Message API wiring

- `src/modules/message/message.controller.ts`

  - Added `getStoragePathFromUrl` to strip the public base URL from persisted attachment URLs and recover the Backblaze file key.
  - New `downloadCourseAttachment` handler at `GET /api/courses/:courseId/messages/:messageId/attachment`:
    1. Validates authentication and parses the route params.
    2. Loads the message + attachment metadata, returning 404 if either is missing or mismatched.
    3. Applies access control:
       - Admin: verifies course existence.
       - Everyone else: reuses `ensureCourseMembership` (lecturer/student membership + ban enforcement).
    4. Generates a signed download URL and responds with `{ url, expiresIn, fileName, mimeType, size }`.

- `src/modules/message/message.routes.ts`

  - Registers the new handler before the pin/unpin endpoints to avoid param conflicts.

- `src/modules/message/message.service.ts`
  - `serializeMessage` now annotates attachments with a per-message API path (`attachment.downloadUrl`) that points to the new endpoint. Existing consumers still receive the original file metadata.

## Client considerations

- For any attachment-bearing message, call the `downloadUrl` path to obtain a fresh signed URL before initiating a file download.
- The signed URL currently expires after 60 seconds; clients should initiate downloads immediately and request a new link if needed.
- If `B2_PUBLIC_BASE_URL` changes format, adjust it to the canonical Backblaze pattern to keep bucket name detection functional.

## Follow-up ideas

1. Honour custom expiry durations via a query parameter (with server-side clamps) if clients need longer-lived links.
2. Cache the download authorisation token per file when multiple downloads are expected within the same short window.
3. Optionally stream files through the API response for environments that forbid exposing signed URLs directly.

---

## Threaded Reply Support

### Goals

- Allow single-level message threading with consistent REST/SSE payloads.
- Surface reply metadata (`parentMessageId`, `replyCount`, `latestReply`) on every message shape shared between REST and Socket.io.
- Add dedicated reply retrieval and ensure socket clients receive both the new messages and updated reply counts.
- Keep unread tracking untouched—replies remain regular course messages—while preventing nested replies (>1 level).

### Prisma schema changes

- Extended `Message` with `parentMessageId` (self-relation) and `deleted` flag, plus supporting indexes for course/parent reads.
- Added migration `20251120120000_add_message_threads` with FK + indexes and regenerated the Prisma client (`npx prisma generate`).

### Service layer updates (`src/modules/message/message.service.ts`)

- `messageSelect` now includes `parentMessageId` and `deleted`; `serializeMessage` injects `replyCount`/`latestReply` and `attachment.downloadUrl`.
- `fetchReplySummaries` gathers reply counts + latest reply info via `groupBy` + `distinct` lookups; reused across list, search, and parent summary updates.
- `createTextMessage` / `createFileMessage` return `{ message, parentUpdate }`, running all work inside a transaction with `loadParentMessage` validation (same course, non-deleted, top-level).
- Added `fetchMessageReplies` for chronological thread pagination.

### HTTP + Socket integration

- `POST /api/courses/:courseId/messages|uploads` accept optional `parentMessageId`, emit `course_message:new`, and fan out `course_message:reply_count` (with `{ courseId, messageId, replyCount, latestReply }`) when replies mutate.
- New `GET /api/courses/:courseId/messages/:messageId/replies` endpoint mirrors pagination schema while enforcing membership/admin access.
- Socket schema supports an optional `parentMessageId`; replies go through existing creation flow.

### Tests (`tests/messageReplies.test.ts`)

- Uses a lightweight mocked Prisma client to simulate parent + reply lifecycle, covering:
  - Reply creation returning parent summary (count + latest preview).
  - Reply retrieval ordering and count increments across multiple replies.
  - Socket broadcasts for both `course_message:new` and `course_message:reply_count` payloads.
- Added Vitest (`npm run test`) with config scaffolded in `vitest.config.ts`.

### Operational notes

- Regenerate Prisma client after schema edits (`npx prisma generate`).
- `npx tsc --noEmit --pretty false` validates types; `npm run test` executes Vitest suite.
- Controllers ensure admins bypass membership while enforcing parent/child invariants for reuse by REST and Socket.io flows.
