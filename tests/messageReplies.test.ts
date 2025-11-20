import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { MessageType, UserRole } from "@prisma/client";
import type { ReplySummaryPayload, SerializedMessage } from "../src/modules/message/message.service";

interface UserRecord {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  department: string | null;
}

interface MessageRecord {
  id: string;
  courseId: string;
  senderId: string;
  parentMessageId: string | null;
  content: string | null;
  type: MessageType;
  createdAt: Date;
  pinned: boolean;
  pinnedAt: Date | null;
  pinnedById: string | null;
  deleted: boolean;
}

interface TestState {
  users: Map<string, UserRecord>;
  messages: Map<string, MessageRecord>;
  replies: MessageRecord[];
  attachments: Map<string, { messageId: string }>;
  nextId: number;
  timestamp: number;
}

const state: TestState = {
  users: new Map(),
  messages: new Map(),
  replies: [],
  attachments: new Map(),
  nextId: 1,
  timestamp: 0,
};

function nextMessageId() {
  return `msg-${state.nextId++}`;
}

function nextDate() {
  const base = new Date("2025-01-01T00:00:00.000Z");
  return new Date(base.getTime() + state.timestamp++ * 1000);
}

function resetState() {
  state.users = new Map([
    [
      "user-1",
      {
        id: "user-1",
        name: "Parent Author",
        email: "parent@example.com",
        role: UserRole.STUDENT,
        department: "CS",
      },
    ],
    [
      "user-2",
      {
        id: "user-2",
        name: "Responder",
        email: "reply@example.com",
        role: UserRole.STUDENT,
        department: "CS",
      },
    ],
  ]);

  state.messages = new Map([
    [
      "parent-1",
      {
        id: "parent-1",
        courseId: "course-1",
        senderId: "user-1",
        parentMessageId: null,
        content: "Parent message",
        type: MessageType.TEXT,
        createdAt: nextDate(),
        pinned: false,
        pinnedAt: null,
        pinnedById: null,
        deleted: false,
      },
    ],
  ]);

  state.replies = [];
  state.attachments = new Map();
  state.nextId = 1;
  state.timestamp = 1; // ensure replies are after parent
}

function pickUser(userId: string | null, select: Record<string, boolean>) {
  if (!userId) return null;
  const user = state.users.get(userId);
  if (!user) return null;
  const result: Record<string, unknown> = {};
  for (const key of Object.keys(select)) {
    if (select[key as keyof typeof select]) {
      result[key] = (user as Record<string, unknown>)[key];
    }
  }
  return result;
}

function applySelect(record: MessageRecord, select: Record<string, any>) {
  const result: Record<string, any> = {};

  for (const key of Object.keys(select)) {
    const value = select[key];
    if (!value) continue;

    switch (key) {
      case "sender": {
        result.sender = pickUser(record.senderId, value.select);
        break;
      }
      case "pinnedBy": {
        result.pinnedBy = record.pinnedById
          ? pickUser(record.pinnedById, value.select)
          : null;
        break;
      }
      case "attachment": {
        result.attachment = null;
        break;
      }
      default: {
        result[key] = (record as Record<string, unknown>)[key];
        break;
      }
    }
  }

  return result;
}

function matchesWhere(record: MessageRecord, where: Record<string, any>) {
  if (!where) return true;

  if (where.courseId && record.courseId !== where.courseId) return false;

  if (Object.prototype.hasOwnProperty.call(where, "parentMessageId")) {
    const constraint = where.parentMessageId;
    if (constraint === null && record.parentMessageId !== null) {
      return false;
    }
    if (typeof constraint === "string" && record.parentMessageId !== constraint) {
      return false;
    }
    if (
      constraint &&
      typeof constraint === "object" &&
      Array.isArray(constraint.in) &&
      !constraint.in.includes(record.parentMessageId)
    ) {
      return false;
    }
  }

  if (
    Object.prototype.hasOwnProperty.call(where, "deleted") &&
    record.deleted !== where.deleted
  ) {
    return false;
  }

  if (where.createdAt?.gt && !(record.createdAt > where.createdAt.gt)) {
    return false;
  }

  return true;
}

function sortRecords(records: MessageRecord[], orderBy?: any) {
  if (!orderBy) return [...records];
  const criteria = Array.isArray(orderBy) ? orderBy : [orderBy];
  return [...records].sort((a, b) => {
    for (const criterion of criteria) {
      const [field, direction] = Object.entries(criterion)[0] as [
        keyof MessageRecord,
        "asc" | "desc"
      ];
      const aValue = a[field];
      const bValue = b[field];
      if (aValue < bValue) return direction === "asc" ? -1 : 1;
      if (aValue > bValue) return direction === "asc" ? 1 : -1;
    }
    return 0;
  });
}

const fakePrisma = {
  $transaction: vi.fn(async (cb: (client: typeof fakePrisma) => any) => cb(fakePrisma)),
  message: {
    findUnique: vi.fn(async ({ where, select }: any) => {
      const record = state.messages.get(where.id) ??
        state.replies.find((item) => item.id === where.id) ??
        null;
      if (!record) return null;
      return select ? applySelect(record, select) : { ...record };
    }),
    findUniqueOrThrow: vi.fn(async (args: any) => {
      const result = await fakePrisma.message.findUnique(args);
      if (!result) {
        throw new Error("Not found");
      }
      return result;
    }),
    create: vi.fn(async ({ data }: any) => {
      const record: MessageRecord = {
        id: nextMessageId(),
        courseId: data.courseId,
        senderId: data.senderId,
        parentMessageId: data.parentMessageId ?? null,
        content: data.content ?? null,
        type: data.type,
        createdAt: nextDate(),
        pinned: false,
        pinnedAt: null,
        pinnedById: null,
        deleted: false,
      };

      if (record.parentMessageId) {
        state.replies.push(record);
      } else {
        state.messages.set(record.id, record);
      }

      return record;
    }),
    findMany: vi.fn(async (args: any) => {
      const where = args?.where ?? {};
      let records: MessageRecord[] = [];

      if (Object.prototype.hasOwnProperty.call(where, "parentMessageId")) {
        const constraint = where.parentMessageId;
        if (constraint && typeof constraint === "object" && Array.isArray(constraint.in)) {
          records = state.replies.filter((item) => constraint.in.includes(item.parentMessageId));
        } else if (typeof constraint === "string") {
          records = state.replies.filter((item) => item.parentMessageId === constraint);
        } else if (constraint === null) {
          records = [...state.messages.values()].filter((item) => item.parentMessageId === null);
        } else {
          records = [...state.replies];
        }
      } else {
        records = [...state.messages.values(), ...state.replies];
      }

      records = records.filter((record) => matchesWhere(record, where));
      records = sortRecords(records, args?.orderBy);

      if (Array.isArray(args?.distinct) && args.distinct.length > 0) {
        const [field] = args.distinct as Array<keyof MessageRecord>;
        const seen = new Set<any>();
        records = records.filter((record) => {
          const value = (record as any)[field];
          if (seen.has(value)) {
            return false;
          }
          seen.add(value);
          return true;
        });
      }

      if (typeof args?.take === "number") {
        records = records.slice(0, args.take);
      }

      if (args?.select) {
        return records.map((record) => applySelect(record, args.select));
      }

      return records.map((record) => ({ ...record }));
    }),
    groupBy: vi.fn(async ({ where, _count }: any) => {
      const ids: string[] = where.parentMessageId.in ?? [];
      if (!_count?.parentMessageId) {
        return [];
      }
      return ids
        .map((id) => ({
          parentMessageId: id,
          _count: {
            parentMessageId: state.replies.filter((reply) => reply.parentMessageId === id).length,
          },
        }))
        .filter((row) => row._count.parentMessageId > 0);
    }),
    count: vi.fn(async ({ where }: any) => {
      const records = [...state.messages.values(), ...state.replies];
      return records.filter((record) => matchesWhere(record, where)).length;
    }),
    updateMany: vi.fn(async () => ({ count: 0 })),
    update: vi.fn(async ({ where, data, select }: any) => {
      const record =
        state.messages.get(where.id) || state.replies.find((item) => item.id === where.id);
      if (!record) {
        throw new Error("Not found");
      }
      Object.assign(record, data);
      return select ? applySelect(record, select) : { ...record };
    }),
    findFirst: vi.fn(async ({ where, select }: any) => {
      const record = [...state.messages.values(), ...state.replies].find((item) =>
        matchesWhere(item, where)
      );
      if (!record) return null;
      return select ? applySelect(record, select) : { ...record };
    }),
  },
  attachment: {
    create: vi.fn(async ({ data }: any) => {
      const id = `att-${state.nextId++}`;
      state.attachments.set(id, { messageId: data.messageId });
      return { id, ...data };
    }),
  },
  course: {
    findUniqueOrThrow: vi.fn(async () => ({ id: "course-1" })),
  },
};

vi.mock("../src/lib/prisma", () => ({ prisma: fakePrisma }));

let createTextMessage: (
  courseId: string,
  senderId: string,
  content: string,
  parentMessageId?: string | null
) => Promise<{ message: SerializedMessage; parentUpdate?: ReplySummaryPayload }>;
let fetchMessageReplies: (
  courseId: string,
  messageId: string,
  limit?: number,
  cursor?: string
) => Promise<{ replies: SerializedMessage[]; nextCursor: string | null }>;
let broadcastCourseReplySummary: (
  io: any,
  payload: ReplySummaryPayload
) => void;
let broadcastCourseMessage: (
  io: any,
  message: SerializedMessage
) => void;

beforeAll(async () => {
  const messageService = await import("../src/modules/message/message.service");
  createTextMessage = messageService.createTextMessage;
  fetchMessageReplies = messageService.fetchMessageReplies;
  const socketHandlers = await import("../src/sockets/chat.handlers");
  broadcastCourseReplySummary = socketHandlers.broadcastCourseReplySummary;
  broadcastCourseMessage = socketHandlers.broadcastCourseMessage;
});

beforeEach(() => {
  vi.clearAllMocks();
  resetState();
});

describe("threaded message replies", () => {
  it("creates a reply and returns parent summary payload", async () => {
    const result = await createTextMessage(
      "course-1",
      "user-2",
      "First reply",
      "parent-1"
    );

    expect(result.message.parentMessageId).toBe("parent-1");
    expect(result.message.replyCount).toBe(0);
    expect(result.message.latestReply).toBeNull();
    expect(result.parentUpdate).toMatchObject({
      courseId: "course-1",
      messageId: "parent-1",
      replyCount: 1,
    });
    expect(result.parentUpdate?.latestReply?.preview).toBe("First reply");
  });

  it("fetches replies in chronological order and updates counts", async () => {
    await createTextMessage("course-1", "user-2", "First", "parent-1");
    await createTextMessage("course-1", "user-2", "Second", "parent-1");

    const replies = await fetchMessageReplies("course-1", "parent-1");

    expect(replies.replies).toHaveLength(2);
    expect(replies.replies[0].content).toBe("First");
    expect(replies.replies[1].content).toBe("Second");
    expect(replies.nextCursor).toBeNull();

    const lastParentUpdate = await createTextMessage(
      "course-1",
      "user-2",
      "Third",
      "parent-1"
    );

    expect(lastParentUpdate.parentUpdate?.replyCount).toBe(3);
    expect(lastParentUpdate.parentUpdate?.latestReply?.preview).toBe("Third");
  });

  it("emits socket events for messages and reply summaries", () => {
    const emitSpy = vi.fn();
    const io = {
      to: vi.fn(() => ({ emit: emitSpy })),
    };

    const message = {
      id: "msg-123",
      courseId: "course-1",
      senderId: "user-2",
      content: "Reply",
      type: MessageType.TEXT,
      createdAt: new Date(),
      parentMessageId: "parent-1",
      replyCount: 0,
      latestReply: null,
      attachment: null,
      pinned: false,
      pinnedAt: null,
      pinnedBy: null,
      sender: pickUser("user-2", {
        id: true,
        name: true,
        email: true,
        role: true,
        department: true,
      }),
      deleted: false,
    } as unknown as SerializedMessage;

    broadcastCourseMessage(io, message);
    expect(io.to).toHaveBeenCalledWith("course-1");
    expect(emitSpy).toHaveBeenCalledWith("course_message:new", message);

    const summary: ReplySummaryPayload = {
      courseId: "course-1",
      messageId: "parent-1",
      replyCount: 5,
      latestReply: {
        id: "msg-xyz",
        sender: pickUser("user-2", {
          id: true,
          name: true,
          email: true,
          role: true,
          department: true,
        })!,
        preview: "Preview",
        createdAt: new Date(),
      },
    };

    broadcastCourseReplySummary(io, summary);
    expect(emitSpy).toHaveBeenCalledWith("course_message:reply_count", summary);
  });
});
