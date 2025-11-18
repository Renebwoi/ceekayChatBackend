import B2 from "backblaze-b2";
import { appConfig } from "../config/env";

// Single Backblaze client reused for all uploads.
const b2 = new B2({
  applicationKeyId: appConfig.b2.keyId,
  applicationKey: appConfig.b2.applicationKey,
});

let authorizedAt: number | null = null;
const AUTH_EXPIRY_MS = 1000 * 60 * 60; // 1 hour safety refresh

// Lazily re-authorize with Backblaze when our cached token expires.
async function ensureAuthorized() {
  if (!authorizedAt || Date.now() - authorizedAt > AUTH_EXPIRY_MS) {
    await b2.authorize();
    authorizedAt = Date.now();
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
