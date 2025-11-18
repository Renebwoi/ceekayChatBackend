declare module "backblaze-b2" {
  interface UploadUrlResponse {
    data: {
      uploadUrl: string;
      authorizationToken: string;
    };
  }

  interface UploadFileResponse {
    data: {
      fileId: string;
    };
  }

  export default class B2 {
    constructor(config: { applicationKeyId: string; applicationKey: string });
    authorize(): Promise<void>;
    getUploadUrl(params: { bucketId: string }): Promise<UploadUrlResponse>;
    uploadFile(params: {
      uploadUrl: string;
      uploadAuthToken: string;
      fileName: string;
      data: Buffer;
      mime?: string;
    }): Promise<UploadFileResponse>;
  }
}
