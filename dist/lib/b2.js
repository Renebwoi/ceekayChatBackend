"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.uploadToB2 = uploadToB2;
const backblaze_b2_1 = __importDefault(require("backblaze-b2"));
const env_1 = require("../config/env");
// Single Backblaze client reused for all uploads.
const b2 = new backblaze_b2_1.default({
    applicationKeyId: env_1.appConfig.b2.keyId,
    applicationKey: env_1.appConfig.b2.applicationKey
});
let authorizedAt = null;
const AUTH_EXPIRY_MS = 1000 * 60 * 60; // 1 hour safety refresh
// Lazily re-authorize with Backblaze when our cached token expires.
async function ensureAuthorized() {
    if (!authorizedAt || Date.now() - authorizedAt > AUTH_EXPIRY_MS) {
        await b2.authorize();
        authorizedAt = Date.now();
    }
}
// Upload a buffer to Backblaze and return the public URL and file id.
async function uploadToB2({ fileName, buffer, mimeType }) {
    await ensureAuthorized();
    const uploadUrl = await b2.getUploadUrl({
        bucketId: env_1.appConfig.b2.bucketId
    });
    const result = await b2.uploadFile({
        uploadUrl: uploadUrl.data.uploadUrl,
        uploadAuthToken: uploadUrl.data.authorizationToken,
        fileName,
        data: buffer,
        mime: mimeType
    });
    return {
        fileUrl: `${env_1.appConfig.b2.publicBaseUrl}/${fileName}`,
        fileId: result.data.fileId
    };
}
