// Community Screen — entry point: registers init/ready/setup hooks and dispatches to feature modules.

import { MODULE_ID, MODULE_TITLE } from "./module.mjs";
import { logger } from "./lib/logger.mjs";
import * as settings from "./settings.mjs";
import * as sockets from "./sockets.mjs";

Hooks.once("init", () => {
  logger.info(`Initializing ${MODULE_TITLE}.`);
  settings.init();
});

Hooks.once("ready", () => {
  const version = game.modules.get(MODULE_ID)?.version ?? "unknown";
  logger.info(`Ready. Version ${version}.`);
});

Hooks.once("socketlib.ready", () => {
  sockets.register();
});
