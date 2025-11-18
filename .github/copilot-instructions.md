<!-- Copilot / AI agent instructions for repository contributors -->

# Copilot instructions (repository-level guidance)

Purpose

- Short, actionable notes to help an AI coding agent be immediately productive in this repo.

Quick note: I couldn't find repository files during initial analysis. This file is a concise template — please replace the placeholders below with project-specific details (build/test commands, key paths, and external services) so agents can operate with high confidence.

What to add first (required)

- Big-picture summary (1-2 lines): list major components and where they live. Example: "API (src/api), background workers (src/workers), web client (packages/web), DB migrations (migrations/)".
- Single canonical run/build/test commands. Example: "Build: npm run build | Test: npm test | Start locally: docker-compose up".
- Location of secrets and env examples: e.g., `.env.example` and how secrets are provided in CI.

How an agent should approach changes

- Always find and run the project's test command before proposing behavior changes. Put the exact command in the 'What to add first' section above.
- If there are no tests, create at least one focused unit test that proves the bug or the new behavior.
- Do not create or commit secrets. If a change needs a secret, add a placeholder and document how to set it in CI or locally.

Architecture notes (fill these in)

- Services and boundaries: e.g., "auth service (src/auth) handles JWT issuance; api service (src/api) validates tokens and calls internal RPC via src/rpc".
- Data flow examples: e.g., "HTTP -> api -> service layer -> repository -> postgres".
- Deployment model: e.g., "deployed via Docker images pushed to registry -> Kubernetes cluster (k8s/)".

Project-specific conventions (examples to replace)

- Where server entry points live: `src/index.js` or `cmd/`.
- Config pattern: prefer `.env` + `config/*.js` or `config/*.yaml`.
- Migrations: `migrations/` directory using [tool].
- Tests: `tests/` folder; use `jest` for Node, `pytest` for Python. Put the project's actual test command above.

Integration points & external deps

- List external services (postgrest, redis, S3, third-party APIs). Specify any required auth scopes or callback URLs.
- CI/CD: indicate workflow files (`.github/workflows/ci.yml`) or external pipelines.

Examples and search tips for agents (replace with real paths)

- To find the main API: search for `express()` or `FastAPI()` or `app.listen` in `src/`.
- To find database usage: search for `pg.Pool`, `sqlalchemy`, or files named `db*` or `repository`.
- To find background jobs: search for `bull`, `celery`, `worker`, `queue`.

Behavioral rules for the agent (non-negotiable)

- Run & report test results locally. If unavailable, explain why and add a reproducible test.
- Avoid network calls that exfiltrate data. Do not attempt to retrieve secrets from environment files.
- Keep diffs minimal: prefer targeted edits and small tests.

How to update this file

- After you add real project facts (build/test commands and key directories), update the "What to add first" and "Architecture notes" sections. That will dramatically improve AI suggestions.

Contact / follow-ups

- If any CI command or build step is undocumented, add it to `README.md` and reference it here.

---

Please replace the placeholders above with specific commands and file paths from this repo, then tell me and I'll re-run an analysis to produce a tailored, minimal instruction set.

## BACKEND AGENT INSTRUCTIONS (ChatRoomX)

Purpose

- Implement a production-ready backend API + realtime server for ChatRoomX (university chat).

Tech stack & constraints

- Node.js + TypeScript, Express.js, Socket.io
- PostgreSQL with Prisma ORM
- Multer (memoryStorage) for uploads
- Backblaze B2 for file storage
- JWT (HS256) for auth, bcrypt for password hashing

Project structure (required)
Place the backend under `src/` with these files (create if missing):

src/
app.ts # Express app, middleware, routes
server.ts # HTTP server + Socket.io init
config/env.ts # read + validate env vars
lib/prisma.ts # export singleton PrismaClient
lib/b2.ts # Backblaze B2 helper: uploadToB2
middleware/auth.ts# JWT auth middleware
middleware/upload.ts # multer memoryStorage + limits
middleware/errorHandler.ts
modules/
auth/ # auth.controller.ts, auth.routes.ts, auth.service.ts, jwt.ts
user/ # user.controller.ts, user.routes.ts
course/ # course.controller.ts, course.routes.ts
message/ # message.controller.ts, message.routes.ts
sockets/
index.ts # io init, auth join rooms
chat.handlers.ts# event handlers
types/express.d.ts # extend Request with user

Prisma schema (discoverable model)

- Use the User, Course, Enrollment, Message, Attachment models and enums exactly as provided in the spec. Put in `prisma/schema.prisma` and run:

  npx prisma generate
  npx prisma migrate dev --name init

DB and client

- `lib/prisma.ts` should export a single PrismaClient instance reused across the app.
- Read DB URL from `DATABASE_URL` in env and fail fast if missing.

.env.example (minimum)

- DATABASE_URL=postgresql://user:password@host:port/dbname
- JWT_SECRET=replace_me
- PORT=4000
- CLIENT_ORIGIN=http://localhost:5173
- B2_KEY_ID=your_key_id
- B2_APPLICATION_KEY=your_key
- B2_BUCKET_ID=your_bucket_id
- B2_PUBLIC_BASE_URL=https://your_b2_public_base/file/your-bucket-name

Auth requirements

- Endpoints: POST /api/auth/register and POST /api/auth/login
- Hash passwords with bcrypt; return user (no password) + JWT.
- JWT helpers in `modules/auth/jwt.ts`: `signToken(payload)` and `verifyToken(token)`.
- Auth middleware (`middleware/auth.ts`) reads `Authorization: Bearer <token>`, verifies, and sets `req.user = { id, role }`.
- Extend Express Request type in `types/express.d.ts` to include `user`.

Course & enrollment

- Routes under `/api/courses`.
- POST /api/courses — LECTURER only; body { code, title }.
- GET /api/courses/my — returns courses where user is lecturer or enrolled.
- POST /api/courses/:courseId/enroll — STUDENT only; creates Enrollment (unique enforced).
- Provide a reusable helper to check membership and lecturer status (used by routes and sockets).

Messaging (text)

- Routes: `/api/courses/:courseId/messages`.
- GET supports pagination via `cursor` (message id) and `limit` (default 20); returns messages asc by createdAt.
- POST creates TEXT message and emits `course_message:new` via Socket.io to room = courseId.

File uploads + Backblaze B2

- `middleware/upload.ts` uses `multer.memoryStorage()`; file size limit 20MB; allowed mimetypes: pdf, doc, docx, xls, xlsx, png, jpeg.
- `lib/b2.ts` authorizes with `B2_KEY_ID` and `B2_APPLICATION_KEY`; implement `uploadToB2({ fileName, buffer, mimeType })` that returns `{ fileUrl, fileId }`.
- Endpoint: POST /api/courses/:courseId/uploads
  - Uses `authenticate` middleware and `upload.single('file')`.
  - Validates file exists and membership.
  - Uploads to B2 with name `${courseId}/${Date.now()}_${originalName}`.
  - In a Prisma transaction, create Message (type FILE) then Attachment with metadata and URL.
  - Emit `course_message:new` to room = courseId.

Socket.io

- server.ts should create HTTP server and Socket.io, set CORS to `CLIENT_ORIGIN`, and attach `io` to app via `app.set('io', io)`.
- Socket auth: `io.use` reads `socket.handshake.auth.token`, verifies JWT, sets `socket.data.user = { id }`.
- On connection, query Prisma for courses where user is lecturer or enrolled and `socket.join(courseId)` for each.
- Listen for `course_message` events from clients to create messages server-side and broadcast `course_message:new` to room.

App/server wiring

- `app.ts`: setup Express, JSON parser, CORS with credentials, route mounts for `/api/auth`, `/api/users`, `/api/courses`, global error handler.
- `server.ts`: create HTTP server, init Socket.io, attach to app, listen on `PORT`.

Scripts (package.json)

- dev: `ts-node-dev --respawn --transpile-only src/server.ts` (or nodemon with ts-node)
- build: `tsc`
- start: `node dist/server.js`
- prisma:migrate: `prisma migrate dev`

Documentation & acceptance

- `README.md` should document the stack, env vars, how to run migrations, and dev start steps.
- Acceptance: register/login users, create courses (lecturer), enroll students, list user courses, send/receive realtime messages per course, upload files to B2 and broadcast file messages.

Notes for agents

- Follow the project's TypeScript strictness and use interfaces/types for request/response shapes.
- Keep controller methods thin: validate, call service, return result.
- Use transactions when creating a Message + Attachment to keep DB consistent.
- Avoid committing secrets. Add placeholders to `.env.example` and reference GitHub Secrets in CI notes.
