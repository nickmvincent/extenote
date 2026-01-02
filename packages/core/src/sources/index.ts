import type {
  LoadedSchema,
  SourceConfig,
  VaultIssue,
  VaultObject,
  Visibility
} from "../types.js";
import { loadLocalSource } from "./local.js";

export interface SourceLoadContext {
  cwd: string;
  schemas: LoadedSchema[];
  visibilityField: string;
  defaultVisibility: Visibility;
  verbose?: boolean;
}

export interface SourceLoadResult {
  sourceId: string;
  objects: VaultObject[];
  issues: VaultIssue[];
  lastSynced?: number;
}

export async function loadSource(
  source: SourceConfig,
  context: SourceLoadContext
): Promise<SourceLoadResult> {
  if (source.disabled) {
    return { sourceId: source.id, objects: [], issues: [] };
  }

  switch (source.type) {
    case "local":
      return loadLocalSource(source, context);
    default:
      throw new Error(`Unsupported source type ${(source as SourceConfig).type}`);
  }
}
