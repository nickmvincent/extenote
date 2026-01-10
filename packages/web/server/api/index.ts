/**
 * API utilities - errors, validation, schemas, and OpenAPI
 */

// Error handling
export {
  ApiError,
  ApiValidationError,
  formatErrorResponse,
  notFound,
  badRequest,
  invalidJson,
  ErrorCodes,
  type ErrorCode,
} from "./errors.js";

// Request validation
export { validateBody, validateQuery, tryValidateBody } from "./validation.js";

// OpenAPI specification
export { getOpenAPISpec, getSwaggerUIHtml, zodToOpenAPI, generateOpenAPISpec } from "./openapi.js";
export type {
  OpenAPISpec,
  OpenAPISchema,
  OpenAPIOperation,
  OpenAPIParameter,
  OpenAPIRequestBody,
  OpenAPIResponse,
  OpenAPIPath,
} from "./openapi.js";

// All schemas
export * from "./schemas/index.js";
