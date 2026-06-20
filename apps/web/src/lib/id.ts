let _counter = 0;

/**
 * Crypto-safe random id with a fallback for non-secure contexts.
 *
 * `crypto.randomUUID` only exists in secure contexts (HTTPS or `localhost`);
 * over a plain-HTTP LAN address it is `undefined`. Mirror the guard the editor
 * package uses for node ids (`packages/editor` `makeNodeId`) so asset/project
 * ids work regardless of how the dev server is reached.
 */
export function safeRandomId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${(_counter += 1)}`;
}
