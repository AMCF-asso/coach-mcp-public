// Entrée du Worker (src/worker/entry.ts), sans Workers : HTTPS, Host, Origin, /mcp, /mcp/, page d'accueil,
// 404, corps plafonné, lots refusés, et un journal qui ne cite jamais les arguments.
import assert from "node:assert/strict";
import { test } from "node:test";
import { handle, MAX_BODY_BYTES, mcpLabels } from "../src/worker/entry.ts";
import { HSTS_HEADER } from "../src/worker/https.ts";

const BASE = "https://mcp.azerty.global";
const PROTOCOL = "2025-06-18";
const MCP_HEADERS = { host: "mcp.azerty.global", "content-type": "application/json", accept: "application/json, text/event-stream", "mcp-protocol-version": PROTOCOL };

function post(path: string, body: unknown, headers: Record<string, string> = {}): Promise<Response> {
  return handle(new Request(`${BASE}${path}`, { method: "POST", headers: { ...MCP_HEADERS, ...headers }, body: typeof body === "string" ? body : JSON.stringify(body) }));
}

async function payload(response: Response): Promise<any> {
  const raw = await response.text();
  const json = response.headers.get("content-type")?.includes("text/event-stream")
    ? (raw.split("\n").filter((l) => l.startsWith("data:")).map((l) => l.slice(5).trim()).at(-1) ?? "null")
    : raw;
  return JSON.parse(json);
}

/** Lignes de console.log et console.error pendant `work`. */
async function logsOf(work: () => Promise<unknown>): Promise<string[]> {
  const lines: string[] = [];
  const { log, error } = console;
  console.log = (...args: unknown[]) => void lines.push(args.join(" "));
  console.error = (...args: unknown[]) => void lines.push(args.join(" "));
  try {
    await work();
  } finally {
    console.log = log;
    console.error = error;
  }
  return lines;
}

test("HTTP redirigé en HTTPS (308), HSTS en HTTPS", async () => {
  const redirect = await handle(new Request("http://mcp.azerty.global/mcp", { method: "POST", headers: MCP_HEADERS, body: "{}" }));
  assert.equal(redirect.status, 308);
  assert.equal(redirect.headers.get("location"), "https://mcp.azerty.global/mcp");
  const home = await handle(new Request(`${BASE}/`, { headers: { host: "mcp.azerty.global" } }));
  assert.equal(home.headers.get("strict-transport-security"), HSTS_HEADER);
});

test("Host étranger refusé, sur /mcp comme sur /", async () => {
  const mcp = await post("/mcp", { jsonrpc: "2.0", id: 1, method: "tools/list" }, { host: "evil.example" });
  assert.equal(mcp.status, 403);
  const home = await handle(new Request(`${BASE}/`, { headers: { host: "evil.example" } }));
  assert.equal(home.status, 403);
});

test("Origin étrangère refusée, Origin des hôtes admise", async () => {
  const evil = await post("/mcp", { jsonrpc: "2.0", id: 1, method: "tools/list" }, { origin: "https://evil.example" });
  assert.equal(evil.status, 403);
  const chatgpt = await post("/mcp", { jsonrpc: "2.0", id: 1, method: "tools/list" }, { origin: "https://chatgpt.com" });
  assert.equal(chatgpt.status, 200);
});

test("/mcp : initialize puis tools/list ; /mcp/ servi comme /mcp", async () => {
  const init = await post("/mcp", { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: PROTOCOL, capabilities: {}, clientInfo: { name: "test", version: "0" } } });
  assert.equal(init.status, 200);
  const initBody = await payload(init);
  assert.equal(initBody.result.serverInfo.name, "azerty-coach");
  assert.equal(initBody.result.serverInfo.title, "AZERTY Coach");
  assert.deepEqual(initBody.result.serverInfo.icons, [{ src: "https://mcp.azerty.global/icon.png", mimeType: "image/png", sizes: ["200x200"] }]);
  const list = await post("/mcp/", { jsonrpc: "2.0", id: 2, method: "tools/list" });
  assert.equal(list.status, 200);
  const names = (await payload(list)).result.tools.map((t: any) => t.name).sort();
  assert.deepEqual(names, ["check_exercise", "compare_layouts", "find_character", "get_lessons", "how_to_type"]);
});

test("page d'accueil en texte, 404 ailleurs", async () => {
  const home = await handle(new Request(`${BASE}/`, { headers: { host: "mcp.azerty.global" } }));
  assert.equal(home.status, 200);
  assert.match(home.headers.get("content-type") ?? "", /^text\/plain/);
  assert.match(await home.text(), /https:\/\/mcp\.azerty\.global\/mcp/);
  const missing = await handle(new Request(`${BASE}/nope`, { headers: { host: "mcp.azerty.global" } }));
  assert.equal(missing.status, 404);
  const postHome = await handle(new Request(`${BASE}/`, { method: "POST", headers: { host: "mcp.azerty.global" }, body: "x" }));
  assert.equal(postHome.status, 404);
});

test("icône PNG sur /icon.png et /favicon.ico", async () => {
  for (const path of ["/icon.png", "/favicon.ico"]) {
    const res = await handle(new Request(`${BASE}${path}`, { headers: { host: "mcp.azerty.global" } }));
    assert.equal(res.status, 200, path);
    assert.equal(res.headers.get("content-type"), "image/png");
    const bytes = new Uint8Array(await res.arrayBuffer());
    assert.deepEqual([...bytes.subarray(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], path); // signature PNG
  }
  const head = await handle(new Request(`${BASE}/icon.png`, { method: "HEAD", headers: { host: "mcp.azerty.global" } }));
  assert.equal(head.status, 200);
  assert.equal((await head.arrayBuffer()).byteLength, 0);
});

test("corps de plus de 256 000 octets refusé (413), lot JSON-RPC refusé (400)", async () => {
  const big = await post("/mcp", "x".repeat(MAX_BODY_BYTES + 1));
  assert.equal(big.status, 413);
  assert.equal(((await big.json()) as any).error.code, -32600);
  const batch = await post("/mcp", [{ jsonrpc: "2.0", id: 1, method: "tools/list" }, { jsonrpc: "2.0", id: 2, method: "tools/list" }]);
  assert.equal(batch.status, 400);
});

test("journal : méthode et outil seulement, jamais les arguments", async () => {
  const SENTINEL = "texte-privé-7f3a";
  const lines = await logsOf(async () => {
    const call = await post("/mcp", { jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "how_to_type", arguments: { text: `Ça ${SENTINEL}` } } });
    assert.equal(call.status, 200);
    await call.text();
    await (await post("/mcp", `{"jsonrpc":"2.0","id":4,"method":"tools/call","params":{"name":"${SENTINEL}"`)).text();
    await (await post("/mcp", { jsonrpc: "2.0", id: 5, method: SENTINEL })).text();
  });
  assert.ok(lines.some((l) => l === "POST /mcp tools/call how_to_type → 200"), lines.join("\n"));
  for (const line of lines) assert.ok(!line.includes(SENTINEL), line);
  assert.deepEqual(mcpLabels({ method: "tools/call", params: { name: SENTINEL } }), { method: "tools/call", tool: "other" });
  assert.deepEqual(mcpLabels({ method: SENTINEL }), { method: "other", tool: "" });
});
