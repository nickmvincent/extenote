/**
 * OpenAPI 3.1 Specification Generator
 *
 * Generates OpenAPI spec from Zod schemas for API documentation.
 * Uses manual schema conversion to avoid external dependencies.
 */

import type { ZodSchema, ZodTypeDef } from "zod";
import { z } from "zod";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface OpenAPISchema {
  type?: string;
  format?: string;
  properties?: Record<string, OpenAPISchema>;
  required?: string[];
  items?: OpenAPISchema;
  enum?: string[];
  description?: string;
  default?: unknown;
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  oneOf?: OpenAPISchema[];
  allOf?: OpenAPISchema[];
  anyOf?: OpenAPISchema[];
  additionalProperties?: boolean | OpenAPISchema;
  nullable?: boolean;
}

export interface OpenAPIParameter {
  name: string;
  in: "query" | "path" | "header";
  required?: boolean;
  schema: OpenAPISchema;
  description?: string;
}

export interface OpenAPIRequestBody {
  required?: boolean;
  content: {
    "application/json": {
      schema: OpenAPISchema;
    };
  };
}

export interface OpenAPIResponse {
  description: string;
  content?: {
    "application/json": {
      schema: OpenAPISchema;
    };
  };
}

export interface OpenAPIOperation {
  operationId?: string;
  summary?: string;
  description?: string;
  tags?: string[];
  parameters?: OpenAPIParameter[];
  requestBody?: OpenAPIRequestBody;
  responses: Record<string, OpenAPIResponse>;
}

export interface OpenAPIPath {
  get?: OpenAPIOperation;
  post?: OpenAPIOperation;
  put?: OpenAPIOperation;
  delete?: OpenAPIOperation;
  patch?: OpenAPIOperation;
}

export interface OpenAPISpec {
  openapi: string;
  info: {
    title: string;
    version: string;
    description?: string;
  };
  servers?: Array<{ url: string; description?: string }>;
  paths: Record<string, OpenAPIPath>;
  components?: {
    schemas?: Record<string, OpenAPISchema>;
    securitySchemes?: Record<string, unknown>;
  };
  tags?: Array<{ name: string; description?: string }>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Zod to OpenAPI Schema Conversion
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Convert a Zod schema to an OpenAPI schema.
 * Handles common Zod types; complex types may need manual extension.
 */
export function zodToOpenAPI(schema: ZodSchema<unknown, ZodTypeDef, unknown>): OpenAPISchema {
  const def = schema._def;
  const typeName = def.typeName as string;

  // Handle description from .describe()
  const description = def.description as string | undefined;

  switch (typeName) {
    case "ZodString": {
      const result: OpenAPISchema = { type: "string" };
      if (description) result.description = description;
      // Extract string constraints
      const checks = (def as { checks?: Array<{ kind: string; value?: unknown; regex?: RegExp }> }).checks || [];
      for (const check of checks) {
        if (check.kind === "min") result.minLength = check.value as number;
        if (check.kind === "max") result.maxLength = check.value as number;
        if (check.kind === "regex" && check.regex) result.pattern = check.regex.source;
        if (check.kind === "email") result.format = "email";
        if (check.kind === "url") result.format = "uri";
        if (check.kind === "uuid") result.format = "uuid";
      }
      return result;
    }

    case "ZodNumber": {
      const result: OpenAPISchema = { type: "number" };
      if (description) result.description = description;
      const checks = (def as { checks?: Array<{ kind: string; value?: number }> }).checks || [];
      for (const check of checks) {
        if (check.kind === "int") result.type = "integer";
        if (check.kind === "min") result.minimum = check.value;
        if (check.kind === "max") result.maximum = check.value;
      }
      return result;
    }

    case "ZodBoolean": {
      const result: OpenAPISchema = { type: "boolean" };
      if (description) result.description = description;
      return result;
    }

    case "ZodArray": {
      const itemSchema = zodToOpenAPI((def as { type: ZodSchema<unknown> }).type);
      const result: OpenAPISchema = { type: "array", items: itemSchema };
      if (description) result.description = description;
      return result;
    }

    case "ZodObject": {
      const shape = (def as { shape: () => Record<string, ZodSchema<unknown>> }).shape();
      const properties: Record<string, OpenAPISchema> = {};
      const required: string[] = [];

      for (const [key, value] of Object.entries(shape)) {
        properties[key] = zodToOpenAPI(value);
        // Check if field is required (not optional)
        if (!value.isOptional()) {
          required.push(key);
        }
      }

      const result: OpenAPISchema = {
        type: "object",
        properties,
      };
      if (required.length > 0) result.required = required;
      if (description) result.description = description;
      return result;
    }

    case "ZodEnum": {
      const values = (def as { values: string[] }).values;
      const result: OpenAPISchema = { type: "string", enum: values };
      if (description) result.description = description;
      return result;
    }

    case "ZodOptional": {
      const inner = zodToOpenAPI((def as { innerType: ZodSchema<unknown> }).innerType);
      return inner;
    }

    case "ZodNullable": {
      const inner = zodToOpenAPI((def as { innerType: ZodSchema<unknown> }).innerType);
      return { ...inner, nullable: true };
    }

    case "ZodDefault": {
      const inner = zodToOpenAPI((def as { innerType: ZodSchema<unknown> }).innerType);
      const defaultValue = (def as { defaultValue: () => unknown }).defaultValue();
      return { ...inner, default: defaultValue };
    }

    case "ZodRecord": {
      const valueSchema = zodToOpenAPI((def as { valueType: ZodSchema<unknown> }).valueType);
      const result: OpenAPISchema = {
        type: "object",
        additionalProperties: valueSchema,
      };
      if (description) result.description = description;
      return result;
    }

    case "ZodUnion": {
      const options = (def as { options: ZodSchema<unknown>[] }).options.map(zodToOpenAPI);
      const result: OpenAPISchema = { oneOf: options };
      if (description) result.description = description;
      return result;
    }

    case "ZodLiteral": {
      const value = (def as { value: unknown }).value;
      if (typeof value === "string") {
        return { type: "string", enum: [value] };
      }
      if (typeof value === "number") {
        return { type: "number", enum: [value] };
      }
      if (typeof value === "boolean") {
        return { type: "boolean", enum: [value] };
      }
      return {};
    }

    case "ZodUnknown":
    case "ZodAny":
      return {};

    case "ZodEffects": {
      // Handle .refine(), .transform(), etc. by extracting the inner schema
      const inner = (def as { schema: ZodSchema<unknown> }).schema;
      return zodToOpenAPI(inner);
    }

    default:
      // Fallback for unhandled types
      console.warn(`Unhandled Zod type: ${typeName}`);
      return {};
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// API Documentation
// ─────────────────────────────────────────────────────────────────────────────

import {
  CreateRequestSchema,
  CreateResponseSchema,
  WriteRequestSchema,
  WriteResponseSchema,
  GetObjectQuerySchema,
  ExportRequestSchema,
  ExportResponseSchema,
  RefcheckRequestSchema,
  TagMutationSchema,
  TaxonomyFixRequestSchema,
  ErrorResponseSchema,
  SuccessResponseSchema,
} from "./schemas/index.js";

/**
 * Generate the complete OpenAPI specification for the Extenote API
 */
export function generateOpenAPISpec(): OpenAPISpec {
  return {
    openapi: "3.1.0",
    info: {
      title: "Extenote API",
      version: "0.1.0",
      description:
        "API for the Extenote content management system. Provides endpoints for managing content objects, tags, references, and exports.",
    },
    servers: [
      {
        url: "http://localhost:3001",
        description: "Local development server",
      },
    ],
    tags: [
      { name: "Vault", description: "Vault and cache operations" },
      { name: "Objects", description: "Content object CRUD operations" },
      { name: "Tags", description: "Tag management and taxonomy" },
      { name: "Refcheck", description: "Reference verification" },
      { name: "Export", description: "Content export operations" },
      { name: "Settings", description: "Application settings" },
    ],
    paths: {
      "/api/vault": {
        get: {
          operationId: "getVault",
          summary: "Get vault contents",
          description: "Retrieve all content from the vault with computed metadata",
          tags: ["Vault"],
          responses: {
            "200": {
              description: "Vault contents",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      vault: { type: "object", description: "Vault data" },
                    },
                  },
                },
              },
            },
            "500": {
              description: "Server error",
              content: {
                "application/json": {
                  schema: zodToOpenAPI(ErrorResponseSchema),
                },
              },
            },
          },
        },
      },
      "/api/reload": {
        get: {
          operationId: "reloadVault",
          summary: "Reload vault cache",
          description: "Force a reload of the vault cache from disk",
          tags: ["Vault"],
          responses: {
            "200": {
              description: "Cache reloaded",
              content: {
                "application/json": {
                  schema: zodToOpenAPI(SuccessResponseSchema),
                },
              },
            },
          },
        },
      },
      "/api/cache/status": {
        get: {
          operationId: "getCacheStatus",
          summary: "Get cache status",
          description: "Retrieve current cache statistics",
          tags: ["Vault"],
          responses: {
            "200": {
              description: "Cache status",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      enabled: { type: "boolean" },
                      ttl: { type: "number" },
                      entries: { type: "number" },
                    },
                  },
                },
              },
            },
          },
        },
      },
      "/api/create": {
        post: {
          operationId: "createObject",
          summary: "Create a new object",
          description: "Create a new content object with the specified schema and metadata",
          tags: ["Objects"],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: zodToOpenAPI(CreateRequestSchema),
              },
            },
          },
          responses: {
            "200": {
              description: "Object created",
              content: {
                "application/json": {
                  schema: zodToOpenAPI(CreateResponseSchema),
                },
              },
            },
            "400": {
              description: "Validation error",
              content: {
                "application/json": {
                  schema: zodToOpenAPI(ErrorResponseSchema),
                },
              },
            },
          },
        },
      },
      "/api/object": {
        get: {
          operationId: "getObject",
          summary: "Get an object",
          description: "Retrieve a content object by path or ID",
          tags: ["Objects"],
          parameters: [
            {
              name: "path",
              in: "query",
              required: false,
              schema: { type: "string" },
              description: "Relative file path",
            },
            {
              name: "id",
              in: "query",
              required: false,
              schema: { type: "string" },
              description: "Object ID",
            },
          ],
          responses: {
            "200": {
              description: "Object data",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      object: { type: "object" },
                    },
                  },
                },
              },
            },
            "400": {
              description: "Validation error (neither path nor id provided)",
              content: {
                "application/json": {
                  schema: zodToOpenAPI(ErrorResponseSchema),
                },
              },
            },
            "404": {
              description: "Object not found",
              content: {
                "application/json": {
                  schema: zodToOpenAPI(ErrorResponseSchema),
                },
              },
            },
          },
        },
      },
      "/api/write": {
        post: {
          operationId: "writeObject",
          summary: "Write object content",
          description: "Update an object's frontmatter and/or body content",
          tags: ["Objects"],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: zodToOpenAPI(WriteRequestSchema),
              },
            },
          },
          responses: {
            "200": {
              description: "Write successful",
              content: {
                "application/json": {
                  schema: zodToOpenAPI(WriteResponseSchema),
                },
              },
            },
            "400": {
              description: "Validation error",
              content: {
                "application/json": {
                  schema: zodToOpenAPI(ErrorResponseSchema),
                },
              },
            },
          },
        },
      },
      "/api/tags": {
        get: {
          operationId: "getTags",
          summary: "Get all tags",
          description: "Retrieve a list of all tags with usage counts",
          tags: ["Tags"],
          responses: {
            "200": {
              description: "Tag list",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      tags: {
                        type: "array",
                        items: {
                          type: "object",
                          properties: {
                            tag: { type: "string" },
                            count: { type: "integer" },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
      "/api/tags/preview": {
        post: {
          operationId: "previewTagMutation",
          summary: "Preview tag mutation",
          description: "Preview the effects of a tag rename, delete, or merge operation",
          tags: ["Tags"],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: zodToOpenAPI(
                  z.object({
                    mutation: TagMutationSchema,
                  })
                ),
              },
            },
          },
          responses: {
            "200": {
              description: "Preview results",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      affectedObjects: { type: "integer" },
                      preview: { type: "array", items: { type: "object" } },
                    },
                  },
                },
              },
            },
          },
        },
      },
      "/api/tags/apply": {
        post: {
          operationId: "applyTagMutation",
          summary: "Apply tag mutation",
          description: "Apply a tag rename, delete, or merge operation",
          tags: ["Tags"],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: zodToOpenAPI(
                  z.object({
                    mutation: TagMutationSchema,
                  })
                ),
              },
            },
          },
          responses: {
            "200": {
              description: "Mutation applied",
              content: {
                "application/json": {
                  schema: zodToOpenAPI(SuccessResponseSchema),
                },
              },
            },
          },
        },
      },
      "/api/tags/taxonomy": {
        get: {
          operationId: "getTaxonomy",
          summary: "Get taxonomy violations",
          description: "Retrieve taxonomy violations and suggested fixes",
          tags: ["Tags"],
          responses: {
            "200": {
              description: "Taxonomy data",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      violations: { type: "array", items: { type: "object" } },
                    },
                  },
                },
              },
            },
          },
        },
      },
      "/api/tags/taxonomy/fix": {
        post: {
          operationId: "fixTaxonomyViolation",
          summary: "Fix taxonomy violation",
          description: "Apply a fix to a taxonomy violation",
          tags: ["Tags"],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: zodToOpenAPI(TaxonomyFixRequestSchema),
              },
            },
          },
          responses: {
            "200": {
              description: "Fix applied",
              content: {
                "application/json": {
                  schema: zodToOpenAPI(SuccessResponseSchema),
                },
              },
            },
          },
        },
      },
      "/api/refcheck/providers": {
        get: {
          operationId: "getRefcheckProviders",
          summary: "List available providers",
          description: "Get list of available reference verification providers",
          tags: ["Refcheck"],
          responses: {
            "200": {
              description: "Provider list",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      providers: {
                        type: "array",
                        items: { type: "string" },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
      "/api/refcheck": {
        post: {
          operationId: "runRefcheck",
          summary: "Run reference check",
          description: "Verify bibliographic references against external providers",
          tags: ["Refcheck"],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: zodToOpenAPI(RefcheckRequestSchema),
              },
            },
          },
          responses: {
            "200": {
              description: "Check results",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      results: { type: "array", items: { type: "object" } },
                      stats: { type: "object" },
                    },
                  },
                },
              },
            },
          },
        },
      },
      "/api/refcheck/stats": {
        get: {
          operationId: "getRefcheckStats",
          summary: "Get refcheck statistics",
          description: "Get verification statistics for a project",
          tags: ["Refcheck"],
          parameters: [
            {
              name: "project",
              in: "query",
              required: false,
              schema: { type: "string" },
              description: "Project name",
            },
          ],
          responses: {
            "200": {
              description: "Statistics",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      total: { type: "integer" },
                      verified: { type: "integer" },
                      pending: { type: "integer" },
                    },
                  },
                },
              },
            },
          },
        },
      },
      "/api/export": {
        post: {
          operationId: "exportProject",
          summary: "Export project",
          description: "Export project content to various formats",
          tags: ["Export"],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: zodToOpenAPI(ExportRequestSchema),
              },
            },
          },
          responses: {
            "200": {
              description: "Export completed",
              content: {
                "application/json": {
                  schema: zodToOpenAPI(ExportResponseSchema),
                },
              },
            },
            "400": {
              description: "Validation error",
              content: {
                "application/json": {
                  schema: zodToOpenAPI(ErrorResponseSchema),
                },
              },
            },
          },
        },
      },
      "/api/settings": {
        get: {
          operationId: "getSettings",
          summary: "Get settings",
          description: "Retrieve current application settings",
          tags: ["Settings"],
          responses: {
            "200": {
              description: "Settings",
              content: {
                "application/json": {
                  schema: { type: "object" },
                },
              },
            },
          },
        },
        post: {
          operationId: "saveSettings",
          summary: "Save settings",
          description: "Update application settings",
          tags: ["Settings"],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { type: "object" },
              },
            },
          },
          responses: {
            "200": {
              description: "Settings saved",
              content: {
                "application/json": {
                  schema: zodToOpenAPI(SuccessResponseSchema),
                },
              },
            },
          },
        },
      },
      "/api/settings/reset": {
        post: {
          operationId: "resetSettings",
          summary: "Reset settings",
          description: "Reset settings to defaults",
          tags: ["Settings"],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    section: { type: "string", description: "Settings section to reset" },
                  },
                },
              },
            },
          },
          responses: {
            "200": {
              description: "Settings reset",
              content: {
                "application/json": {
                  schema: zodToOpenAPI(SuccessResponseSchema),
                },
              },
            },
          },
        },
      },
      "/api/openapi.json": {
        get: {
          operationId: "getOpenAPISpec",
          summary: "Get OpenAPI specification",
          description: "Retrieve the OpenAPI 3.1 specification for this API",
          tags: ["Vault"],
          responses: {
            "200": {
              description: "OpenAPI specification",
              content: {
                "application/json": {
                  schema: { type: "object" },
                },
              },
            },
          },
        },
      },
    },
    components: {
      schemas: {
        ErrorResponse: zodToOpenAPI(ErrorResponseSchema),
        SuccessResponse: zodToOpenAPI(SuccessResponseSchema),
        CreateRequest: zodToOpenAPI(CreateRequestSchema),
        CreateResponse: zodToOpenAPI(CreateResponseSchema),
        WriteRequest: zodToOpenAPI(WriteRequestSchema),
        WriteResponse: zodToOpenAPI(WriteResponseSchema),
        ExportRequest: zodToOpenAPI(ExportRequestSchema),
        ExportResponse: zodToOpenAPI(ExportResponseSchema),
        RefcheckRequest: zodToOpenAPI(RefcheckRequestSchema),
        TagMutation: zodToOpenAPI(TagMutationSchema),
        TaxonomyFixRequest: zodToOpenAPI(TaxonomyFixRequestSchema),
      },
    },
  };
}

// Cached spec - regenerated on server restart
let cachedSpec: OpenAPISpec | null = null;

/**
 * Get the OpenAPI spec (cached for performance)
 */
export function getOpenAPISpec(): OpenAPISpec {
  if (!cachedSpec) {
    cachedSpec = generateOpenAPISpec();
  }
  return cachedSpec;
}

/**
 * Simple HTML page that renders the OpenAPI spec using Swagger UI CDN
 */
export function getSwaggerUIHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Extenote API Documentation</title>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui.css">
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
  <script>
    window.onload = () => {
      SwaggerUIBundle({
        url: '/api/openapi.json',
        dom_id: '#swagger-ui',
        presets: [SwaggerUIBundle.presets.apis, SwaggerUIBundle.SwaggerUIStandalonePreset],
        layout: 'BaseLayout',
        deepLinking: true,
        showExtensions: true,
        showCommonExtensions: true,
      });
    };
  </script>
</body>
</html>`;
}
