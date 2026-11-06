// Profils d'hôte (src/mcp/hosts.ts) : les valeurs de ui.domain recalculées d'après la documentation de chaque hôte.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import { MCP_PATHS, profileOfPath, PUBLIC_ORIGIN, UI_DOMAIN } from "../src/mcp/hosts.ts";

/** Formule de Claude (MCP Apps, « Set ui.domain for Claude ») : 32 premiers hex du SHA-256 de l'URL, puis .claudemcpcontent.com. */
const claudeDomain = (url: string) => `${createHash("sha256").update(url).digest("hex").slice(0, 32)}.claudemcpcontent.com`;

test("formule de Claude : l'exemple de la doc, puis l'URL de ce serveur", () => {
  assert.equal(claudeDomain("https://example.com/mcp"), "c3d80a4ed901ee05b21755a88273b4a4.claudemcpcontent.com"); // valeur imprimée par la doc
  assert.equal(UI_DOMAIN.claude, claudeDomain(`${PUBLIC_ORIGIN}${MCP_PATHS.claude}`));
});

test("ui.domain : aucun par défaut, une origine https pour OpenAI, des chemins distincts", () => {
  assert.equal(UI_DOMAIN.default, undefined);
  assert.equal(UI_DOMAIN.openai, "https://mcp.azerty.global");
  assert.equal(new Set(Object.values(MCP_PATHS)).size, 3);
  assert.equal(profileOfPath("/mcp"), "default");
  assert.equal(profileOfPath("/mcp/openai"), "openai");
  assert.equal(profileOfPath("/mcp/claude"), "claude");
  assert.equal(profileOfPath("/mcp/"), undefined);
});
