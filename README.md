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
- Admin role can create/update/delete courses, manage enrollments, assign lecturers, and ban/unban users via `/api/admin`
- Per-user unread tracking backed by `CourseReadState`; `/api/courses/my` includes `unreadCount` and `/api/courses/:courseId/read` marks a course chat as read

## Testing & quality

- `npm run lint` (TypeScript no-emit check)
- Add Jest or integration tests as the project evolves

## Deployment

- Build with `npm run build` and deploy the `dist/` output alongside generated Prisma client
- Ensure environment variables are provided (GitHub Secrets, Azure KeyVault, etc.)
- Run database migrations via `npm run prisma:migrate`

## Unread tracking

- `CourseReadState` Prisma model records the last time each user opened a course chat
- `GET /api/courses/my` now includes an `unreadCount` per course derived from `CourseReadState`
- `POST /api/courses/:courseId/read` upserts the read state (no Socket.io side effects); call it when a user views a course chat
