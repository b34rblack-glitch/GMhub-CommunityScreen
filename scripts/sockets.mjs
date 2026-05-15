// Community Screen — socketlib registration and inter-client RPC dispatch.

import { MODULE_ID } from "./module.mjs";
import { logger } from "./lib/logger.mjs";

/**
 * The socketlib module handle for this module. Populated by `register()`.
 * @type {object | null}
 */
let cs = null;

/**
 * @returns {object | null} The socketlib handle, or null until socketlib.ready fires.
 */
export function getSocket() {
  return cs;
}

/**
 * Stub handler factory. Logs the call so we can see RPC plumbing during Phase 1.
 *
 * @param {string} name - Handler name.
 * @returns {Function}
 */
function stub(name) {
  return (...args) => {
    logger.info(`stub: ${name} called`, ...args);
  };
}

/**
 * Internal registry of handler names → implementations. Feature modules can
 * call `setHandler(name, fn)` to override the stub before the real handlers
 * are wired in later phases.
 *
 * @type {Map<string, Function>}
 */
const handlers = new Map();

/**
 * Replace a stub with a real implementation. Safe to call before or after
 * `register()` — re-registration via socketlib happens immediately if the
 * socket is already up.
 *
 * @param {string} name - Handler name.
 * @param {Function} fn - Async or sync handler.
 * @returns {void}
 */
export function setHandler(name, fn) {
  handlers.set(name, fn);
  if (cs) {
    try {
      cs.register(name, fn);
    } catch (err) {
      logger.error(`Failed to re-register socket handler "${name}"`, err);
    }
  }
}

/**
 * Register the module with socketlib and bind every handler name we expect.
 * Called from `Hooks.once("socketlib.ready")` in `main.mjs`.
 *
 * @returns {void}
 */
export function register() {
  if (!globalThis.socketlib) {
    logger.error("socketlib is not available — module requires the socketlib dependency.");
    return;
  }
  cs = socketlib.registerModule(MODULE_ID);

  const names = [
    "showJournal",
    "showItem",
    "showImage",
    "showPortrait",
    "closeAllPopups",
    "setVisionFocus",
    "setUiHidden",
    "setTableMode",
    "followScene",
    "followLevel",
    "toggleTableMode",
  ];

  for (const name of names) {
    const fn = handlers.get(name) ?? stub(name);
    cs.register(name, fn);
  }

  logger.info(`Registered ${names.length} socket handlers.`);
}

/**
 * Invoke a handler on a specific user's client. Wraps socketlib's
 * `executeAsUser` with a try/catch and a localized warning on failure.
 *
 * @param {string} handler - Handler name registered above.
 * @param {string} userId - Target user id.
 * @param {...*} args - Arguments forwarded to the handler.
 * @returns {Promise<*>}
 */
export async function executeAsUser(handler, userId, ...args) {
  if (!cs) {
    logger.warn(`Socket not ready when calling "${handler}".`);
    return undefined;
  }
  try {
    return await cs.executeAsUser(handler, userId, ...args);
  } catch (err) {
    logger.error(`Socket "${handler}" failed:`, err);
    try {
      ui.notifications?.warn(game.i18n.localize("COMMUNITY_SCREEN.errors.table-offline"));
    } catch {
      // ui not ready yet
    }
    throw err;
  }
}

/**
 * Invoke a handler on a GM client (whichever is connected first).
 *
 * @param {string} handler - Handler name.
 * @param {...*} args - Forwarded args.
 * @returns {Promise<*>}
 */
export async function executeAsGM(handler, ...args) {
  if (!cs) return undefined;
  return cs.executeAsGM(handler, ...args);
}
