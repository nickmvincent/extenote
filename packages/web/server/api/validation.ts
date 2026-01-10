/**
 * Request validation utilities using Zod
 */

import { type ZodSchema } from "zod";
import { ApiValidationError, invalidJson } from "./errors.js";

/**
 * Validate and parse a request body against a Zod schema.
 * Throws ApiValidationError if validation fails.
 */
export async function validateBody<T>(
  req: Request,
  schema: ZodSchema<T>
): Promise<T> {
  let body: unknown;

  try {
    body = await req.json();
  } catch {
    throw invalidJson();
  }

  const result = schema.safeParse(body);

  if (!result.success) {
    throw new ApiValidationError(result.error);
  }

  return result.data;
}

/**
 * Validate query parameters from a URL against a Zod schema.
 * Throws ApiValidationError if validation fails.
 */
export function validateQuery<T>(url: URL, schema: ZodSchema<T>): T {
  const params = Object.fromEntries(url.searchParams.entries());
  const result = schema.safeParse(params);

  if (!result.success) {
    throw new ApiValidationError(result.error);
  }

  return result.data;
}

/**
 * Safe parse that returns null instead of throwing.
 * Useful when you want to handle validation yourself.
 */
export async function tryValidateBody<T>(
  req: Request,
  schema: ZodSchema<T>
): Promise<{ data: T; error: null } | { data: null; error: ApiValidationError }> {
  try {
    const data = await validateBody(req, schema);
    return { data, error: null };
  } catch (error) {
    if (error instanceof ApiValidationError) {
      return { data: null, error };
    }
    throw error;
  }
}
