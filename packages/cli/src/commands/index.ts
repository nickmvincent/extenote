import { Command } from "commander";

// System commands (root level)
import { registerInitCommand } from "./init.js";
import { registerDoctorCommand } from "./doctor.js";
import { registerUndoCommand } from "./undo.js";
import { registerStatusCommand } from "./status.js";
import { registerGuideCommand } from "./guide.js";

// Content commands (viewing, editing, managing content)
import { registerViewCommand } from "./content/view.js";
import { registerListCommand } from "./content/list.js";
import { registerEditCommand } from "./content/edit.js";
import { registerSearchCommand } from "./content/search.js";
import { registerIssuesCommand } from "./content/issues.js";
import { registerLintCommand } from "./content/lint.js";
import { registerCreateCommand, registerCreatorCommand } from "./content/create.js";
import { registerExportCommand } from "./content/export.js";
import { registerTagsCommand } from "./content/tags.js";

// Project commands (building, deploying, syncing)
import { registerBuildCommand } from "./project/build.js";
import { registerDeployCommand } from "./project/deploy.js";
import { registerWebsitesCommand } from "./project/websites.js";
import { registerSyncCommand } from "./project/sync.js";
import { registerDiscussionsCommand } from "./project/discussions.js";
import { registerSyncCitationsCommand } from "./project/sync-citations.js";
import { registerRefcheckCommand } from "./project/refcheck.js";

export function registerAllCommands(program: Command) {
  // System
  registerInitCommand(program);
  registerDoctorCommand(program);
  registerUndoCommand(program);
  registerStatusCommand(program);
  registerGuideCommand(program);

  // Content
  registerViewCommand(program);
  registerListCommand(program);
  registerEditCommand(program);
  registerSearchCommand(program);
  registerIssuesCommand(program);
  registerLintCommand(program);
  registerCreateCommand(program);
  registerCreatorCommand(program);
  registerExportCommand(program);
  registerTagsCommand(program);

  // Project
  registerBuildCommand(program);
  registerDeployCommand(program);
  registerWebsitesCommand(program);
  registerSyncCommand(program);
  registerDiscussionsCommand(program);
  registerSyncCitationsCommand(program);
  registerRefcheckCommand(program);
}
