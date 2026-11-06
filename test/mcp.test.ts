// Serveur MCP par son entrée HTTP (web standard, sans socket) : liste des outils, annotations, appels.
import assert from "node:assert/strict";
import { after, test } from "node:test";
import { localhostAllowedHostnames } from "@modelcontextprotocol/server";
import { createHttpEntry } from "../src/mcp/http.ts";
import { createCoachServer } from "../src/mcp/server.ts";

const MCP_PATH = "/0123456789abcdef0123456789abcdef/mcp";
const PROTOCOL = "2025-06-18";
const entry = createHttpEntry({
  mcpPath: MCP_PATH,
  allowedHosts: new Set(localhostAllowedHostnames()),
  allowedOrigins: new Set(["localhost", "127.0.0.1"]),
  factory: () => createCoachServer(),
});
after(() => entry.close());

let rpcId = 0;
async function rpc(method: string, params: Record<string, unknown> = {}): Promise<any> {
  rpcId += 1;
  const response = await entry.fetch(
    new Request(`http://127.0.0.1${MCP_PATH}`, {
      method: "POST",
      headers: { host: "127.0.0.1", "content-type": "application/json", accept: "application/json, text/event-stream", "mcp-protocol-version": PROTOCOL },
      body: JSON.stringify({ jsonrpc: "2.0", id: rpcId, method, params }),
    }),
  );
  const raw = await response.text();
  const payload = response.headers.get("content-type")?.includes("text/event-stream")
    ? (raw.split("\n").filter((l) => l.startsWith("data:")).map((l) => l.slice(5).trim()).at(-1) ?? "null")
    : raw;
  return JSON.parse(payload);
}

async function call(name: string, args: Record<string, unknown>): Promise<{ text: string; data: any; isError: boolean }> {
  const body = await rpc("tools/call", { name, arguments: args });
  assert.ok(body.result, `${name} : ${JSON.stringify(body.error)}`);
  return { text: body.result.content?.[0]?.text ?? "", data: body.result.structuredContent, isError: body.result.isError === true };
}

test("cinq outils, tous en lecture seule", async () => {
  const { result } = await rpc("tools/list");
  const names = result.tools.map((t: any) => t.name).sort();
  assert.deepEqual(names, ["check_exercise", "compare_layouts", "find_character", "get_lessons", "how_to_type"]);
  for (const tool of result.tools) {
    assert.equal(tool.annotations.readOnlyHint, true, tool.name);
    assert.equal(tool.annotations.destructiveHint, false, tool.name);
    assert.equal(tool.annotations.openWorldHint, false, tool.name);
  }
});

test("Host étranger refusé", async () => {
  const response = await entry.fetch(new Request(`http://127.0.0.1${MCP_PATH}`, { method: "POST", headers: { host: "evil.example", "content-type": "application/json" }, body: "{}" }));
  assert.equal(response.status, 403);
});

test("arguments plafonnés : plus de 32 membres refusés avant la validation", async () => {
  const args: Record<string, unknown> = { query: "é" };
  for (let i = 0; i < 100; i += 1) args[`x${i}`] = i;
  const body = await rpc("tools/call", { name: "find_character", arguments: args });
  const message = JSON.stringify(body.error ?? body.result);
  assert.match(message, /more than the maximum of 32 elements/);
  assert.equal((await call("find_character", { query: "é" })).isError, false);
});

test("find_character : AZERTY Global, autre disposition, caractère impossible", async () => {
  const own = await call("find_character", { query: "e dans l'o", layout: "azerty-global" });
  assert.match(own.text, /Sur votre clavier : AltGr \+ O/);
  assert.doesNotMatch(own.text, /Télécharger/);
  assert.equal(own.data.keyboard, undefined); // le widget garde AZERTY Global
  const other = await call("find_character", { query: "É", layout: "azerty-windows" });
  assert.match(other.text, /Impossible à taper sur votre clavier/);
  assert.match(other.text, /Alt \+ 0201/);
  assert.match(other.text, /https:\/\/azerty\.global\/download/);
  const afnor = await call("find_character", { query: "É", layout: "azerty-afnor" });
  assert.match(afnor.text, /AltGr \+ Maj \+ 2/);
  assert.doesNotMatch(afnor.text, /Télécharger/);
  assert.equal(afnor.data.keyboard.id, "azerty-afnor");
  const mac = await call("find_character", { query: "«", layout: "azerty-macos" });
  assert.match(mac.text, /Option \+ 7/);
  assert.match(mac.text, /OS X 10\.9/);
  assert.doesNotMatch(mac.text, /Alt \+ 0171/); // pas de code Alt sous macOS
  const en = await call("find_character", { query: "U+00AB", layout: "qwerty-us", language: "en" });
  assert.match(en.text, /With AZERTY Global: AltGr \+ W/);
  assert.match(en.text, /azerty\.global\/en\/download/);
});

test("compare_layouts et parcours expatrié", async () => {
  const c = await call("compare_layouts", { from: "qwerty-us" });
  assert.equal(c.data.to, "azerty-windows");
  assert.match(c.text, /^De QWERTY américain \(Windows\) vers AZERTY français \(Windows\)/);
  assert.match(c.text, /a — touche A → touche A \(touche Q de QWERTY américain \(Windows\)\)/);
  assert.match(c.text, /Premier exercice \[bases-azerty\/lettres\/1\]/);
  assert.ok(c.data.changes.length <= 80);
  assert.equal(c.data.keyboard.id, "azerty-windows");
  assert.equal(c.data.onLabel, "Sur AZERTY français (Windows)");
  assert.equal((await call("compare_layouts", { from: "qwerty-us", to: "qwerty-us" })).isError, true);
  assert.equal((await call("compare_layouts", { from: "unknown" })).isError, true);

  const list = await call("get_lessons", { track: "expat" });
  assert.deepEqual(list.data.modules.map((m: any) => m.id), ["bases-azerty"]);
  assert.equal(list.data.next.track, "azerty-global");
  // Windows : É, À, Ç, œ, « » ne se tapent qu'avec un code Alt, donc la note de fin de parcours existe et le dit.
  assert.match(list.text, /Une fois ces bases acquises/);
  assert.ok(list.data.next.missing.includes("É"));
  // AFNOR tape tout directement : aucune note, aucun lien AZERTY Global.
  const afnor = await call("get_lessons", { track: "expat", layout: "azerty-afnor" });
  assert.equal(afnor.data.next, undefined);
  assert.doesNotMatch(afnor.text, /AZERTY Global|azerty\.global/);
  const lesson = await call("get_lessons", { track: "expat", module: "bases-azerty", lesson: "ponctuation", layout: "azerty-macos" });
  assert.match(lesson.text, /Frappes sur : AZERTY Français \(macOS\)/);
  const checked = await call("check_exercise", { exercise_id: "bases-azerty/accents/1", typed: "ete deja voila\nça leçon garçon\noù très après", layout: "azerty-afnor" });
  assert.equal(checked.data.layout, "azerty-afnor");
  assert.equal(checked.data.issues[0].kind, "missing_accent");
  assert.equal(checked.data.issues[0].howTo, "touche é");
  assert.equal(checked.data.keyboard.id, "azerty-afnor");
});

test("how_to_type, get_lessons, check_exercise", async () => {
  const text = await call("how_to_type", { text: "Ça coûte 5 €", layout: "azerty-global" });
  assert.deepEqual(text.data.sheets.map((s: any) => s.char), ["Ç", "û", "€"]);
  const list = await call("get_lessons", {});
  assert.equal(list.data.modules.length, 7);
  const lesson = await call("get_lessons", { module: "email-web", lesson: "arobase" });
  assert.equal(lesson.data.exercises[1].id, "email-web/arobase/2");
  assert.match(lesson.text, /@ : touche ²/);
  const good = await call("check_exercise", { exercise_id: "email-web/arobase/2", typed: "a@b.fr\nx@y.eu\nok@go.io" });
  assert.equal(good.data.correct, true);
  const bad = await call("check_exercise", { exercise_id: "email-web/arobase/2", typed: "a@b.fr\nx@y.eu\nok@goio" });
  assert.equal(bad.data.issues[0].kind, "missing");
  const unknown = await call("check_exercise", { exercise_id: "nope/x/1", typed: "a" });
  assert.equal(unknown.isError, true);
});

test("widget clavier : ressource MCP Apps, outils qui l'affichent, page sans ressource externe", async () => {
  const { result: listed } = await rpc("resources/list");
  const widget = listed.resources.find((r: any) => r.uri.startsWith("ui://azerty-coach/keyboard-"));
  assert.ok(widget, JSON.stringify(listed));
  assert.equal(widget.mimeType, "text/html;profile=mcp-app");
  const { result: tools } = await rpc("tools/list");
  const withWidget = tools.tools.filter((t: any) => t._meta?.ui?.resourceUri === widget.uri).map((t: any) => t.name).sort();
  assert.deepEqual(withWidget, ["check_exercise", "compare_layouts", "find_character", "how_to_type"]);

  const { result: read } = await rpc("resources/read", { uri: widget.uri });
  const html: string = read.contents[0].text;
  assert.equal(read.contents[0].mimeType, "text/html;profile=mcp-app");
  assert.doesNotMatch(html, /(src|href)=["']?(https?:)?\/\/|url\(["']?(https?:)?\/\/|["']\/assets\//);
  assert.doesNotMatch(html, /\/\*__[A-Z_]+__\*\//); // tous les marqueurs du gabarit remplis
  assert.match(html, /globalThis\.ExtApps=\{/);
  assert.match(html, /globalThis\.AGKeyboard = \{ AZERTYKeyboard, setTesterLang \}/);
  // CSP sans domaine sous les deux clés : MCP Apps (`ui.csp`) et ChatGPT (`openai/widgetCSP`), sur la ressource listée et lue.
  for (const meta of [widget._meta, read.contents[0]._meta]) {
    assert.deepEqual(meta.ui.csp, { connectDomains: [], resourceDomains: [] });
    assert.deepEqual(meta["openai/widgetCSP"], { connect_domains: [], resource_domains: [] });
  }

  // Ce que le widget lit : la langue et les fiches, y compris pour un exercice.
  const found = await call("find_character", { query: "œ", layout: "azerty-global", language: "en" });
  assert.equal(found.data.language, "en");
  const bad = await call("check_exercise", { exercise_id: "email-web/arobase/2", typed: "a@b.fr\nx@y.eu\nok@goio" });
  assert.deepEqual(bad.data.sheets.map((s: any) => s.char), ["."]);
  assert.equal(bad.data.language, "fr");
});

test("how_to_type : texte de plus de 2000 caractères refusé net, jamais coupé en silence", async () => {
  const exact = await call("how_to_type", { text: `${"a".repeat(1999)}é`, layout: "azerty-windows" });
  assert.deepEqual(exact.data.sheets.map((s: any) => s.char), ["é"]); // 2000 caractères : lu en entier
  assert.equal(exact.data.truncated, false);
  const body = await rpc("tools/call", { name: "how_to_type", arguments: { text: `${"a".repeat(2000)}é` } });
  assert.match(JSON.stringify(body.error ?? body.result), /2000/);
  assert.ok(body.error || body.result?.isError === true, "refusé, pas répondu");
  assert.equal(body.result?.structuredContent, undefined);
  const { result: tools } = await rpc("tools/list");
  const howTo = tools.tools.find((t: any) => t.name === "how_to_type");
  assert.equal(howTo.inputSchema.properties.text.maxLength, 2000);
  assert.match(howTo.description, /up to 2000 characters/);
});

test("how_to_type : plus de 60 caractères distincts, la réponse le dit (FR et EN) et ne prétend rien", async () => {
  const many = Array.from({ length: 70 }, (_, i) => String.fromCodePoint(0x4e00 + i)).join("");
  for (const [language, partial] of [["fr", /Réponse partielle.*60 premiers caractères distincts.*10 autres/s], ["en", /Partial answer.*first 60 distinct characters.*10 more/s]] as const) {
    const out = await call("how_to_type", { text: many, layout: "azerty-global", language });
    assert.equal(out.data.sheets.length, 60);
    assert.equal(out.data.truncated, true);
    assert.equal(out.data.omittedDistinct, 10);
    assert.match(out.text, partial);
  }
  // Lecture complète sans caractère à détailler : la phrase « que des lettres » reste vraie.
  const plain = await call("how_to_type", { text: "Bonjour 2026", layout: "azerty-windows" });
  assert.match(plain.text, /que des lettres sans accent/);
  assert.equal(plain.data.truncated, false);
});
