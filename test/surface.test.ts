// Surface publique : ce qu'un annuaire ou un client lit sans appeler d'outil (initialize, tools/list) est figé dans
// un instantané ; toute modification (description, schéma, annotation, titre) fait échouer ce test et se relit au diff.
// Mettre l'instantané à jour : `UPDATE_SNAPSHOT=1 npm test`, puis relire `git diff test/fixtures/surface.snapshot.json`.
// L'empreinte du widget (changée à chaque resynchronisation avec le site) est masquée : elle n'est pas la surface.
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { after, test } from "node:test";
import { localhostAllowedHostnames } from "@modelcontextprotocol/server";
import { AjvJsonSchemaValidator } from "@modelcontextprotocol/server/validators/ajv";
import { createHttpEntry } from "../src/mcp/http.ts";
import { createCoachServer, VERSION } from "../src/mcp/server.ts";
import { WIDGET_URI } from "../src/mcp/widget.ts";

const PATH = "/mcp";
const entry = createHttpEntry({
  mcpPath: PATH,
  allowedHosts: new Set(localhostAllowedHostnames()),
  allowedOrigins: new Set(["localhost", "127.0.0.1"]),
  factory: () => createCoachServer(),
});
after(() => entry.close());

const fixture = (name: string) => new URL(`./fixtures/${name}`, import.meta.url);
const readJson = (url: URL) => JSON.parse(readFileSync(url, "utf8"));

async function rpc(id: number, method: string, params: Record<string, unknown> = {}): Promise<any> {
  const response = await entry.fetch(
    new Request(`http://127.0.0.1${PATH}`, {
      method: "POST",
      headers: { host: "127.0.0.1", "content-type": "application/json", accept: "application/json, text/event-stream", "mcp-protocol-version": "2025-06-18" },
      body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
    }),
  );
  const raw = await response.text();
  const json = response.headers.get("content-type")?.includes("text/event-stream")
    ? (raw.split("\n").filter((l) => l.startsWith("data:")).map((l) => l.slice(5).trim()).at(-1) ?? "null")
    : raw;
  return JSON.parse(json).result;
}

test("instantané : initialize et tools/list, aucun outil de plus ni de moins, rien de changé en silence", async () => {
  const init = await rpc(1, "initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "test", version: "0" } });
  const { tools } = await rpc(2, "tools/list");
  const widgetHash = WIDGET_URI.match(/keyboard-(.+)\.html$/)![1]!;
  const raw = JSON.stringify({ serverInfo: init.serverInfo, capabilities: init.capabilities, instructions: init.instructions, tools });
  const surface = JSON.parse(raw.split(widgetHash).join("<empreinte-du-widget>"));
  if (process.env.UPDATE_SNAPSHOT) writeFileSync(fixture("surface.snapshot.json"), `${JSON.stringify(surface, null, 2)}\n`);
  assert.deepEqual(surface, readJson(fixture("surface.snapshot.json")));
});

test("annuaires : chaque outil porte un titre et les trois annotations booléennes, nom de 64 caractères au plus", async () => {
  const { tools } = await rpc(1, "tools/list");
  assert.equal(tools.length, 5);
  for (const tool of tools) {
    assert.ok(tool.name.length <= 64, tool.name);
    assert.ok(tool.title, tool.name);
    for (const key of ["readOnlyHint", "destructiveHint", "openWorldHint"]) assert.equal(typeof tool.annotations[key], "boolean", `${tool.name}.${key}`);
    assert.equal(tool.annotations.readOnlyHint, true, tool.name);
  }
});

test("une version, trois fichiers : VERSION, package.json et server.json disent la même", () => {
  const pkg = readJson(new URL("../package.json", import.meta.url));
  const registry = readJson(new URL("../server.json", import.meta.url));
  assert.equal(pkg.version, VERSION);
  assert.equal(registry.version, VERSION);
});

test("server.json : conforme au schéma du registre MCP (2025-12-11), remote Streamable HTTP public", () => {
  const registry = readJson(new URL("../server.json", import.meta.url));
  const validate = new AjvJsonSchemaValidator().getValidator(readJson(fixture("server.schema.json")));
  const verdict = validate(registry);
  assert.equal(verdict.valid, true, JSON.stringify(verdict));
  // Témoin négatif : le validateur refuse bien une description de 101 caractères et un nom sans espace de noms.
  assert.equal(validate({ ...registry, description: "x".repeat(101) }).valid, false);
  assert.equal(validate({ ...registry, name: "azerty-coach" }).valid, false);
  assert.deepEqual(registry.remotes, [{ type: "streamable-http", url: "https://mcp.azerty.global/mcp" }]);
  assert.equal(registry.packages, undefined); // serveur distant : aucun paquet à publier
});

test("sans widget : le texte de chaque réponse donne à lui seul les touches (le rendu ui:// n'est pas assuré partout)", async () => {
  const text = async (name: string, args: Record<string, unknown>): Promise<string> => (await rpc(1, "tools/call", { name, arguments: args })).content[0].text;
  assert.match(await text("find_character", { query: "é", layout: "azerty-windows" }), /touche é/);
  assert.match(await text("how_to_type", { text: "Ça coûte 5 €", layout: "azerty-global" }), /Ç[\s\S]*û[\s\S]*€/);
  assert.match(await text("compare_layouts", { from: "qwerty-us", to: "azerty-windows" }), /→/);
  assert.match(await text("check_exercise", { exercise_id: "email-web/arobase/2", typed: "a@b.fr\nx@y.eu\nok@goio" }), /missing[\s\S]*colonne/);
  assert.match(await text("get_lessons", { module: "email-web", lesson: "arobase" }), /@ : touche ²/);
});
