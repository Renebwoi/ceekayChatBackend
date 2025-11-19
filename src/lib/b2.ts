import B2 from "backblaze-b2";
import { appConfig } from "../config/env";

// Single Backblaze client reused for all uploads.
const b2 = new B2({
  applicationKeyId: appConfig.b2.keyId,
  applicationKey: appConfig.b2.applicationKey,
});

let authorizedAt: number | null = null;
let downloadUrlBase: string | null = null;
let bucketName: string | null = null;
const AUTH_EXPIRY_MS = 1000 * 60 * 60; // 1 hour safety refresh

function deriveDownloadUrlFromPublicBase() {
  try {
    const url = new URL(appConfig.b2.publicBaseUrl);
    return url.origin;
  } catch {
    return null;
  }
}

function deriveBucketNameFromPublicBase(): string | null {
  try {
    const url = new URL(appConfig.b2.publicBaseUrl);
    const segments = url.pathname.split("/").filter(Boolean);
    const fileIndex = segments.indexOf("file");

    if (fileIndex >= 0 && segments[fileIndex + 1]) {
      return segments[fileIndex + 1];
    }

    if (segments.length > 0) {
      return segments[segments.length - 1];
    }

    const hostParts = url.hostname.split(".");
    if (hostParts.length > 1) {
      return hostParts[0];
    }
  } catch {
    // ignore and fall through
  }

  return null;
}

async function resolveBucketNameViaApi() {
  try {
    const response = await (
      b2 as unknown as {
        getBucket: (input: {
          bucketId: string;
        }) => Promise<{ data?: { bucketName?: string } }>;
      }
    ).getBucket({ bucketId: appConfig.b2.bucketId });

    return response.data?.bucketName ?? null;
  } catch {
    return null;
  }
}

// Lazily re-authorize with Backblaze when our cached token expires.
async function ensureAuthorized() {
  const needsRefresh =
    !authorizedAt ||
    Date.now() - authorizedAt > AUTH_EXPIRY_MS ||
    !downloadUrlBase ||
    !bucketName;

  if (needsRefresh) {
    const auth = await (
      b2 as unknown as {
        authorize: () => Promise<{
          data?: {
            downloadUrl?: string;
            allowed?: { bucketName?: string };
          };
        }>;
        downloadUrl?: string;
      }
    ).authorize();

    authorizedAt = Date.now();

    downloadUrlBase =
      auth?.data?.downloadUrl ??
      (b2 as unknown as { downloadUrl?: string }).downloadUrl ??
      downloadUrlBase ??
      deriveDownloadUrlFromPublicBase();

    bucketName =
      auth?.data?.allowed?.bucketName ??
      bucketName ??
      (await resolveBucketNameViaApi()) ??
      deriveBucketNameFromPublicBase();
  }

  downloadUrlBase = downloadUrlBase ?? deriveDownloadUrlFromPublicBase();

  if (!downloadUrlBase) {
    throw new Error(
      "Unable to determine Backblaze download base URL; check B2 credentials and B2_PUBLIC_BASE_URL"
    );
  }

  if (!bucketName) {
    throw new Error(
      "Unable to determine Backblaze bucket name; ensure the application key has bucket access or B2_PUBLIC_BASE_URL encodes the bucket"
    );
  }
}

export type UploadPayload = {
  fileName: string;
  buffer: Buffer;
  mimeType: string;
};

// Upload a buffer to Backblaze and return the public URL and file id.
export async function uploadToB2({
  fileName,
  buffer,
  mimeType,
}: UploadPayload) {
  await ensureAuthorized();

  const uploadUrl = await b2.getUploadUrl({
    bucketId: appConfig.b2.bucketId,
  });

  const result = await b2.uploadFile({
    uploadUrl: uploadUrl.data.uploadUrl,
    uploadAuthToken: uploadUrl.data.authorizationToken,
    fileName,
    data: buffer,
    mime: mimeType,
  });

  return {
    fileUrl: `${appConfig.b2.publicBaseUrl}/${fileName}`,
    fileId: result.data.fileId,
  };
}

export async function getSignedDownloadUrl(
  fileName: string,
  expiresInSeconds = 60
) {
  await ensureAuthorized();

  const duration = Math.max(1, Math.min(expiresInSeconds, 60 * 60));

  const authorization = await (
    b2 as unknown as {
      getDownloadAuthorization: (input: {
        bucketId: string;
        fileNamePrefix: string;
        validDurationInSeconds: number;
      }) => Promise<{ data: { authorizationToken: string } }>;
    }
  ).getDownloadAuthorization({
    bucketId: appConfig.b2.bucketId,
    fileNamePrefix: fileName,
    validDurationInSeconds: duration,
  });

  if (!downloadUrlBase || !bucketName) {
    throw new Error("Backblaze client not fully initialized");
  }

  const url = `${downloadUrlBase}/file/${bucketName}/${fileName}?Authorization=${authorization.data.authorizationToken}`;

  return {
    url,
    expiresIn: duration,
  };
}
