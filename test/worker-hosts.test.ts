// Worker : un point MCP par hôte (ui.domain) et la route du challenge OpenAI, sans Workers.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import { handle } from "../src/worker/entry.ts";

const BASE = "https://mcp.azerty.global";
const HOST = { host: "mcp.azerty.global" };
const MCP_HEADERS = { ...HOST, "content-type": "application/json", accept: "application/json, text/event-stream", "mcp-protocol-version": "2025-06-18" };

function post(path: string, body: unknown): Promise<Response> {
  return handle(new Request(`${BASE}${path}`, { method: "POST", headers: MCP_HEADERS, body: JSON.stringify(body) }));
}

async function payload(response: Response): Promise<any> {
  const raw = await response.text();
  const json = response.headers.get("content-type")?.includes("text/event-stream")
    ? (raw.split("\n").filter((l) => l.startsWith("data:")).map((l) => l.slice(5).trim()).at(-1) ?? "null")
    : raw;
  return JSON.parse(json);
}

/** Méta de la ressource du clavier, lue par `resources/read` sur un chemin du Worker. */
async function widgetMeta(path: string): Promise<any> {
  const { result: listed } = await payload(await post(path, { jsonrpc: "2.0", id: 1, method: "resources/list" }));
  const read = await payload(await post(path, { jsonrpc: "2.0", id: 2, method: "resources/read", params: { uri: listed.resources[0].uri } }));
  return read.result.contents[0]._meta;
}

test("ui.domain par hôte : aucun sur /mcp, l'origine du serveur sur /mcp/openai, le hachage de l'URL sur /mcp/claude", async () => {
  const neutral = await widgetMeta("/mcp");
  assert.equal(neutral.ui.domain, undefined);
  assert.equal(neutral["openai/widgetDomain"], undefined);
  const openai = await widgetMeta("/mcp/openai");
  assert.equal(openai.ui.domain, "https://mcp.azerty.global");
  assert.equal(openai["openai/widgetDomain"], "https://mcp.azerty.global");
  const claude = await widgetMeta("/mcp/claude");
  assert.equal(claude.ui.domain, `${createHash("sha256").update("https://mcp.azerty.global/mcp/claude").digest("hex").slice(0, 32)}.claudemcpcontent.com`);
  assert.equal(claude["openai/widgetDomain"], undefined);
  // CSP identique sous les deux clés, quel que soit l'hôte.
  for (const meta of [neutral, openai, claude]) {
    assert.deepEqual(meta.ui.csp, { connectDomains: [], resourceDomains: [] });
    assert.deepEqual(meta["openai/widgetCSP"], { connect_domains: [], resource_domains: [] });
  }
});

test("/mcp/openai/ servi comme /mcp/openai ; /mcp/claude/ en 404 (le hachage vise l'URL exacte)", async () => {
  const list = { jsonrpc: "2.0", id: 1, method: "tools/list" };
  assert.equal((await post("/mcp/openai/", list)).status, 200);
  assert.equal((await post("/mcp/claude", list)).status, 200);
  assert.equal((await post("/mcp/claude/", list)).status, 404);
  assert.equal((await post("/mcp/autre", list)).status, 404);
});

test("challenge OpenAI : le jeton seul en texte brut, 404 tant que la variable est vide", async () => {
  const url = `${BASE}/.well-known/openai-apps-challenge`;
  assert.equal((await handle(new Request(url, { headers: HOST }))).status, 404);
  assert.equal((await handle(new Request(url, { headers: HOST }), { OPENAI_APPS_CHALLENGE: "  \n" })).status, 404);

  const res = await handle(new Request(url, { headers: HOST }), { OPENAI_APPS_CHALLENGE: "tok_AbC-123.xyz\n" });
  assert.equal(res.status, 200);
  assert.match(res.headers.get("content-type") ?? "", /^text\/plain/);
  assert.equal(res.headers.get("cache-control"), "no-store");
  assert.equal(await res.text(), "tok_AbC-123.xyz"); // exactement le jeton : ni JSON, ni retour à la ligne

  const env = { OPENAI_APPS_CHALLENGE: "tok" };
  const head = await handle(new Request(url, { method: "HEAD", headers: HOST }), env);
  assert.equal(head.status, 200);
  assert.equal(await head.text(), "");
  assert.equal((await handle(new Request(url, { method: "POST", headers: HOST, body: "x" }), env)).status, 404);
  assert.equal((await handle(new Request(url, { headers: { host: "evil.example" } }), env)).status, 403);
  assert.equal((await handle(new Request(url.replace("https:", "http:"), { headers: HOST }), env)).status, 308);
});
