import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { MessageType, UserRole } from "@prisma/client";
import type { SerializedMessage } from "../src/modules/message/message.service";

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

interface AttachmentRecord {
  id: string;
  messageId: string;
  fileName: string;
  mimeType: string;
  size: number;
  url: string;
}

interface TestState {
  users: Map<string, UserRecord>;
  messages: Map<string, MessageRecord>;
  attachments: Map<string, AttachmentRecord>;
  nextMessageId: number;
  nextAttachmentId: number;
  timestamp: number;
}

const state: TestState = {
  users: new Map(),
  messages: new Map(),
  attachments: new Map(),
  nextMessageId: 1,
  nextAttachmentId: 1,
  timestamp: 0,
};

function nextMessageId() {
  return `msg-${state.nextMessageId++}`;
}

function nextAttachmentId() {
  return `att-${state.nextAttachmentId++}`;
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

  state.messages = new Map();
  state.attachments = new Map();
  state.nextMessageId = 1;
  state.nextAttachmentId = 1;
  state.timestamp = 0;
}

function pickUser(userId: string | null, select: Record<string, boolean>) {
  if (!userId) return null;
  const user = state.users.get(userId);
  if (!user) return null;
  const result: Record<string, unknown> = {};
  const source = user as unknown as Record<string, unknown>;
  for (const key of Object.keys(select)) {
    if (select[key]) {
      result[key] = source[key];
    }
  }
  return result;
}

function pickAttachment(messageId: string, select: Record<string, boolean>) {
  const attachment = state.attachments.get(messageId);
  if (!attachment) return null;
  const result: Record<string, unknown> = {};
  const source = attachment as unknown as Record<string, unknown>;
  for (const key of Object.keys(select)) {
    if (select[key]) {
      result[key] = source[key];
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
        result.attachment = pickAttachment(record.id, value.select ?? value);
        break;
      }
      case "parent": {
        if (!record.parentMessageId) {
          result.parent = null;
          break;
        }
        const parent = state.messages.get(record.parentMessageId);
        result.parent = parent
          ? applySelect(parent, value.select ?? value)
          : null;
        break;
      }
      default: {
        const source = record as unknown as Record<string, unknown>;
        result[key] = source[key];
        break;
      }
    }
  }

  return result;
}

function matchesWhere(record: MessageRecord, where: Record<string, any>) {
  if (!where) return true;

  if (where.OR) {
    const clauses = Array.isArray(where.OR) ? where.OR : [where.OR];
    if (!clauses.some((clause) => matchesWhere(record, clause))) {
      return false;
    }
  }

  if (where.AND) {
    const clauses = Array.isArray(where.AND) ? where.AND : [where.AND];
    if (!clauses.every((clause) => matchesWhere(record, clause))) {
      return false;
    }
  }

  if (where.NOT) {
    const clauses = Array.isArray(where.NOT) ? where.NOT : [where.NOT];
    if (clauses.some((clause) => matchesWhere(record, clause))) {
      return false;
    }
  }

  if (where.id && record.id !== where.id) {
    return false;
  }

  if (where.courseId && record.courseId !== where.courseId) {
    return false;
  }

  if (
    Object.prototype.hasOwnProperty.call(where, "deleted") &&
    record.deleted !== where.deleted
  ) {
    return false;
  }

  if (Object.prototype.hasOwnProperty.call(where, "parentMessageId")) {
    const constraint = where.parentMessageId;
    if (constraint === null && record.parentMessageId !== null) {
      return false;
    }
    if (
      typeof constraint === "string" &&
      record.parentMessageId !== constraint
    ) {
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

  if (where.createdAt?.gt && !(record.createdAt > where.createdAt.gt)) {
    return false;
  }

  if (where.content?.contains) {
    const haystack = (record.content ?? "").toLowerCase();
    const needle = where.content.contains.toLowerCase();
    if (!haystack.includes(needle)) {
      return false;
    }
  }

  if (where.attachment?.fileName?.contains) {
    const attachment = state.attachments.get(record.id);
    const haystack = (attachment?.fileName ?? "").toLowerCase();
    const needle = where.attachment.fileName.contains.toLowerCase();
    if (!haystack.includes(needle)) {
      return false;
    }
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

      if (aValue === bValue) {
        continue;
      }

      if (aValue == null) {
        return direction === "asc" ? 1 : -1;
      }

      if (bValue == null) {
        return direction === "asc" ? -1 : 1;
      }

      if (aValue < bValue) {
        return direction === "asc" ? -1 : 1;
      }

      return direction === "asc" ? 1 : -1;
    }
    return 0;
  });
}

const fakePrisma = {
  $transaction: vi.fn(async (cb: (client: typeof fakePrisma) => any) =>
    cb(fakePrisma)
  ),
  message: {
    findUnique: vi.fn(async ({ where, select }: any) => {
      const record = state.messages.get(where.id) ?? null;
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

      state.messages.set(record.id, record);
      return { ...record };
    }),
    findMany: vi.fn(async (args: any = {}) => {
      const where = args.where ?? {};
      let records = Array.from(state.messages.values()).filter((record) =>
        matchesWhere(record, where)
      );

      records = sortRecords(records, args.orderBy);

      if (args.cursor?.id) {
        const index = records.findIndex((item) => item.id === args.cursor.id);
        if (index >= 0) {
          records = records.slice(index + (args.skip ?? 0));
        }
      } else if (typeof args.skip === "number" && args.skip > 0) {
        records = records.slice(args.skip);
      }

      if (typeof args.take === "number") {
        records = records.slice(0, args.take);
      }

      if (args.select) {
        return records.map((record) => applySelect(record, args.select));
      }

      return records.map((record) => ({ ...record }));
    }),
    count: vi.fn(async ({ where }: any) => {
      return Array.from(state.messages.values()).filter((record) =>
        matchesWhere(record, where ?? {})
      ).length;
    }),
    updateMany: vi.fn(async ({ where, data }: any) => {
      let count = 0;
      for (const record of state.messages.values()) {
        if (matchesWhere(record, where ?? {})) {
          Object.assign(record, data);
          count += 1;
        }
      }
      return { count };
    }),
    update: vi.fn(async ({ where, data, select }: any) => {
      const record = state.messages.get(where.id);
      if (!record) {
        throw new Error("Not found");
      }
      Object.assign(record, data);
      return select ? applySelect(record, select) : { ...record };
    }),
    findFirst: vi.fn(async ({ where, select }: any = {}) => {
      const record = Array.from(state.messages.values()).find((item) =>
        matchesWhere(item, where ?? {})
      );
      if (!record) return null;
      return select ? applySelect(record, select) : { ...record };
    }),
  },
  attachment: {
    create: vi.fn(async ({ data }: any) => {
      const record: AttachmentRecord = {
        id: nextAttachmentId(),
        messageId: data.messageId,
        fileName: data.fileName,
        mimeType: data.mimeType,
        size: data.size,
        url: data.url,
      };
      state.attachments.set(record.messageId, record);
      return { ...record };
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
) => Promise<SerializedMessage>;
let fetchCourseMessages: (
  courseId: string,
  limit?: number,
  cursor?: string
) => Promise<{ messages: SerializedMessage[]; nextCursor: string | null }>;

beforeAll(async () => {
  const messageService = await import("../src/modules/message/message.service");
  createTextMessage = messageService.createTextMessage;
  fetchCourseMessages = messageService.fetchCourseMessages;
});

beforeEach(() => {
  vi.clearAllMocks();
  resetState();
});

describe("inline message replies", () => {
  it("includes reply metadata when creating a reply", async () => {
    const parent = await createTextMessage(
      "course-1",
      "user-1",
      "Parent message"
    );
    const reply = await createTextMessage(
      "course-1",
      "user-2",
      "Reply content",
      parent.id
    );

    expect(parent.replyTo).toBeNull();
    expect(reply.parentMessageId).toBe(parent.id);
    expect(reply.replyTo).toEqual({
      id: parent.id,
      senderName: "Parent Author",
      contentSnippet: "Parent message",
      type: MessageType.TEXT,
    });
  });

  it("rejects replies targeting a message in another course", async () => {
    const foreignParent = await createTextMessage(
      "course-2",
      "user-1",
      "Foreign course message"
    );

    await expect(
      createTextMessage(
        "course-1",
        "user-2",
        "Cross course reply",
        foreignParent.id
      )
    ).rejects.toThrow("Parent message not found in this course");
  });

  it("rejects replies to deleted messages", async () => {
    const parent = await createTextMessage(
      "course-1",
      "user-1",
      "Will be deleted"
    );

    const storedParent = state.messages.get(parent.id);
    if (!storedParent) {
      throw new Error("Parent message missing in test state");
    }
    storedParent.deleted = true;

    await expect(
      createTextMessage(
        "course-1",
        "user-2",
        "Reply to deleted",
        parent.id
      )
    ).rejects.toThrow("Cannot reply to a deleted message");
  });

  it("returns messages in chronological order with inline reply metadata", async () => {
    const parent = await createTextMessage(
      "course-1",
      "user-1",
      "Timeline parent"
    );
    const reply = await createTextMessage(
      "course-1",
      "user-2",
      "Timeline reply",
      parent.id
    );
    const another = await createTextMessage(
      "course-1",
      "user-1",
      "Timeline follower"
    );

    const { messages, nextCursor } = await fetchCourseMessages("course-1");

    expect(messages.map((message) => message.id)).toEqual([
      parent.id,
      reply.id,
      another.id,
    ]);
    expect(messages[0].replyTo).toBeNull();
    expect(messages[1].replyTo).toEqual({
      id: parent.id,
      senderName: "Parent Author",
      contentSnippet: "Timeline parent",
      type: MessageType.TEXT,
    });
    expect(messages[2].replyTo).toBeNull();
    expect(nextCursor).toBeNull();
  });

  it("truncates long parent content in reply snippets", async () => {
    const longContent = "x".repeat(150);
    const parent = await createTextMessage(
      "course-1",
      "user-1",
      longContent
    );

    const reply = await createTextMessage(
      "course-1",
      "user-2",
      "Reply to long content",
      parent.id
    );

    expect(reply.replyTo).not.toBeNull();
    expect(reply.replyTo?.contentSnippet).toBeDefined();
    expect(reply.replyTo?.contentSnippet?.length).toBeLessThan(longContent.length);
    expect(reply.replyTo?.contentSnippet?.endsWith("…")).toBe(true);
  });
});
