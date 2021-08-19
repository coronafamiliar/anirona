export type ApiErrorType = "api" | "invalid_request";

export type ApiErrorCode = "invalid_metric";

export interface ApiErrorResponse {
  type: ApiErrorType;
  code: ApiErrorCode;
  message: string;
  param?: string;
  documentationUrl?: string;
}
