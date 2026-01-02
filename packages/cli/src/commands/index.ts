import { Command } from "commander";

// Import all command registration functions
import { registerInitCommand } from "./init.js";
import { registerDoctorCommand } from "./doctor.js";
import { registerUndoCommand } from "./undo.js";
import { registerStatusCommand } from "./status.js";
import { registerViewCommand } from "./view.js";
import { registerListCommand } from "./list.js";
import { registerEditCommand } from "./edit.js";
import { registerSearchCommand } from "./search.js";
import { registerIssuesCommand } from "./issues.js";
import { registerLintCommand } from "./lint.js";
import { registerCreateCommand, registerCreatorCommand } from "./create.js";
import { registerExportCommand } from "./export.js";
import { registerDiscussionsCommand } from "./discussions.js";
import { registerGuideCommand } from "./guide.js";
import { registerBuildCommand } from "./build.js";
import { registerDeployCommand } from "./deploy.js";
import { registerSyncCommand } from "./sync.js";
import { registerRefcheckCommand } from "./refcheck.js";
import { registerWebsitesCommand } from "./websites.js";
import { registerSyncCitationsCommand } from "./sync-citations.js";
import { registerTagsCommand } from "./tags.js";

export function registerAllCommands(program: Command) {
  registerInitCommand(program);
  registerDoctorCommand(program);
  registerUndoCommand(program);
  registerStatusCommand(program);
  registerViewCommand(program);
  registerListCommand(program);
  registerEditCommand(program);
  registerSearchCommand(program);
  registerIssuesCommand(program);
  registerLintCommand(program);
  registerCreateCommand(program);
  registerCreatorCommand(program);
  registerExportCommand(program);
  registerDiscussionsCommand(program);
  registerGuideCommand(program);
  registerBuildCommand(program);
  registerDeployCommand(program);
  registerSyncCommand(program);
  registerRefcheckCommand(program);
  registerWebsitesCommand(program);
  registerSyncCitationsCommand(program);
  registerTagsCommand(program);
}
