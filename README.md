# ChatRoomX Backend

Production-ready backend API and realtime server for the ChatRoomX university chat platform. Built with **Node.js**, **TypeScript**, **Express.js**, **Socket.io**, **PostgreSQL**, and **Prisma**. Supports JWT-based authentication, course management, enrollment, realtime messaging, and Backblaze B2-backed file uploads.

## Tech stack

- Node.js + TypeScript
- Express.js & Socket.io
- PostgreSQL + Prisma ORM
- Multer for uploads, Backblaze B2 storage
- JWT + bcrypt for authentication

## Prerequisites

- Node.js 18+
- PostgreSQL instance (local or remote)
- Backblaze B2 account + bucket

## Environment variables

Create a `.env` file based on `.env.example` and set the following:

```bash
DATABASE_URL=postgresql://user:password@host:port/dbname
JWT_SECRET=replace_me
PORT=4000
CLIENT_ORIGIN=http://localhost:5173
B2_KEY_ID=your_key_id
B2_APPLICATION_KEY=your_key
B2_BUCKET_ID=your_bucket_id
B2_PUBLIC_BASE_URL=https://your_b2_public_base/file/your-bucket-name
```

## Install & setup

```bash
npm install
npm run prisma:generate
npm run prisma:migrate -- --name init
```

## Development

```bash
npm run dev
```

## Build & run

```bash
npm run build
npm start
```

## Project structure

```text
src/
  app.ts
  server.ts
  config/env.ts
  lib/prisma.ts
  lib/b2.ts
  middleware/
    auth.ts
    upload.ts
    errorHandler.ts
  modules/
    auth/
      auth.controller.ts
      auth.routes.ts
      auth.service.ts
      jwt.ts
    admin/
      admin.controller.ts
      admin.routes.ts
      admin.service.ts
    user/
      user.controller.ts
      user.routes.ts
    course/
      course.controller.ts
      course.routes.ts
    message/
      message.controller.ts
      message.routes.ts
  sockets/
    index.ts
    chat.handlers.ts
  types/express.d.ts
prisma/
  schema.prisma
```

## Key capabilities

- Register/login lecturers & students
- Course creation (lecturers) and enrollment (students)
- Course membership-aware message history (paginated)
- Realtime Socket.io events per course room
- File uploads streamed to Backblaze B2 with attachment records
- Secure attachment downloads: `GET /api/courses/:courseId/messages/:messageId/attachment` returns a short-lived Backblaze-signed URL and message payloads surface an `attachment.downloadUrl` API path
- Threaded replies: messages expose `parentMessageId`, `replyCount`, and `latestReply`; replies are posted via `POST /api/courses/:courseId/messages` with `parentMessageId` and fetched at `/api/courses/:courseId/messages/:messageId/replies`
- Admin role can create/update/delete courses, manage enrollments, assign lecturers, and ban/unban users via `/api/admin`
- Per-user unread tracking backed by `CourseReadState`; `/api/courses/my` includes `unreadCount` and `/api/courses/:courseId/read` marks a course chat as read
- Users carry a `department` field (required for students/lecturers) surfaced on auth responses, course membership lists, and message payloads
- Search-ready messaging: `GET /api/courses/:courseId/messages/search` performs case-insensitive queries over message text and attachment filenames with cursor pagination

## Testing & quality

- `npm run lint` (TypeScript no-emit check)
- `npm run test` (Vitest suite covering threaded replies and socket payloads)

## Deployment

- Build with `npm run build` and deploy the `dist/` output alongside generated Prisma client
- Ensure environment variables are provided (GitHub Secrets, Azure KeyVault, etc.)
- Run database migrations via `npm run prisma:migrate`

## Unread tracking

- `CourseReadState` Prisma model records the last time each user opened a course chat
- `GET /api/courses/my` now includes an `unreadCount` per course derived from `CourseReadState`
- `POST /api/courses/:courseId/read` upserts the read state (no Socket.io side effects); call it when a user views a course chat
- User records include a nullable `department`; registration requires it for students/lecturers and all serialized user payloads now expose `{ id, name, email, role, department }`
- `GET /api/courses/:courseId/messages/search?q=<term>&cursor=<id?>` returns the same message shape as history while filtering by content or attachment names (requires course membership or admin access)

## Threaded replies

- Every message now includes `parentMessageId`, `replyCount`, and `latestReply` metadata; replies always have `replyCount = 0` and `latestReply = null`.
- Submit replies by passing `parentMessageId` to `POST /api/courses/:courseId/messages` (text) or `/api/courses/:courseId/uploads` (files). The backend validates the parent belongs to the same course and forbids multi-level nesting.
- Fetch a thread with `GET /api/courses/:courseId/messages/:messageId/replies?cursor=<id?>`; results use the standard message shape with chronological ordering and pagination.
- Socket listeners receive `course_message:new` for both top-level messages and replies; whenever replies change, `course_message:reply_count` broadcasts `{ courseId, messageId, replyCount, latestReply }` so clients can update thread previews.
