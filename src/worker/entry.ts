// Entrée du Worker sans type propre à Workers, pour que les tests Node l'importent (test/worker.test.ts) :
// point MCP public (Streamable HTTP, sans état, sans authentification) sur `/mcp`, page d'accueil en texte
// sur `/`, icône sur `/icon.png` et `/favicon.ico`, 404 ailleurs. Journal : la méthode JSON-RPC et le nom
// d'outil, pris dans des listes fixes ; jamais les arguments (le texte de l'utilisateur), ni les résultats.
import { createHttpEntry, jsonRpcError, text, type HttpEntry } from "../mcp/http.ts";
import { hostHeaderValidationResponse } from "@modelcontextprotocol/server";
import { MCP_PATHS, profileOfPath, PUBLIC_HOST, type HostProfile } from "../mcp/hosts.ts";
import { createCoachServer, DATA_VERSION, VERSION } from "../mcp/server.ts";
import { ICON_PNG_BASE64 } from "../mcp/widget.ts";
import { httpsRedirect, withHsts } from "./https.ts";

export { PUBLIC_HOST };
export const MCP_PATH = MCP_PATHS.default;
/** Vérification de domaine d'OpenAI (annuaire ChatGPT et Codex) : le jeton exact, en texte brut. */
export const OPENAI_CHALLENGE_PATH = "/.well-known/openai-apps-challenge";
// Chemins dont l'adresse collée avec une barre finale est servie comme sans. Pas `/mcp/claude/` : Claude hache l'URL
// exacte, une variante avec barre donnerait « ui.domain mismatch » au lieu d'un 404 net.
const TRAILING_SLASH_OK = new Set([MCP_PATHS.default, MCP_PATHS.openai]);

/** Variables du Worker : le jeton du challenge est un secret (`wrangler secret put OPENAI_APPS_CHALLENGE`), absent tant qu'OpenAI n'en a pas donné. */
export interface WorkerEnv {
  OPENAI_APPS_CHALLENGE?: string;
}
export const MAX_BODY_BYTES = 256_000;
export const MAX_CONCURRENT = 32;
// Les clients MCP côté serveur n'envoient pas d'Origin ; une page de navigateur ne peut appeler que depuis ces sites.
export const ALLOWED_ORIGINS = ["chatgpt.com", "chat.openai.com", "claude.ai", "claude.com"];

// Journalisés tels quels ; toute autre méthode ou tout autre nom d'outil devient `other` (texte libre de l'appelant).
const KNOWN_METHODS = new Set([
  "initialize",
  "notifications/initialized",
  "notifications/cancelled",
  "ping",
  "server/discover",
  "tools/list",
  "tools/call",
  "resources/list",
  "resources/read",
  "resources/templates/list",
  "prompts/list",
]);
const KNOWN_TOOLS = new Set(["find_character", "how_to_type", "get_lessons", "check_exercise", "compare_layouts"]);

export interface CallLabels {
  method: string;
  tool: string;
}

/** Méthode JSON-RPC et nom d'outil d'un corps analysé, pris dans les listes fixes ; jamais les arguments. */
export function mcpLabels(body: unknown): CallLabels {
  if (Array.isArray(body)) return { method: "batch", tool: "" };
  if (typeof body !== "object" || body === null) return { method: "invalid", tool: "" };
  const { method, params } = body as { method?: unknown; params?: { name?: unknown } | null };
  const name = method === "tools/call" ? params?.name : undefined;
  return {
    method: typeof method === "string" && KNOWN_METHODS.has(method) ? method : "other",
    tool: name === undefined ? "" : typeof name === "string" && KNOWN_TOOLS.has(name) ? name : "other",
  };
}

/** Corps d'une requête, lu jusqu'à `MAX_BODY_BYTES` ; null au-delà. */
async function readCappedBody(request: Request): Promise<Uint8Array<ArrayBuffer> | null> {
  const chunks: Uint8Array[] = [];
  let size = 0;
  if (request.body) {
    const reader = request.body.getReader();
    for (let read = await reader.read(); !read.done; read = await reader.read()) {
      size += read.value.byteLength;
      if (size > MAX_BODY_BYTES) {
        await reader.cancel();
        return null;
      }
      chunks.push(read.value);
    }
  }
  const out = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

const HOME = [
  "AZERTY Coach — serveur MCP en lecture seule : taper n'importe quel caractère sur un clavier français, et apprendre l'AZERTY.",
  "AZERTY Coach — read-only MCP server: type any character on a French keyboard, and learn AZERTY.",
  "",
  `Point MCP / MCP endpoint : https://${PUBLIC_HOST}${MCP_PATH}`,
  "Sans compte, sans donnée personnelle conservée. No account, no personal data kept.",
  "https://azerty.global",
  "",
  `Version ${VERSION}, données ${DATA_VERSION}`,
].join("\n");

// L'icône de `serverInfo.icons` (ICON_URL) et le favicon que certains hôtes demandent à l'origine du serveur.
export const ICON_PATHS = new Set(["/icon.png", "/favicon.ico"]);
let iconBytes: Uint8Array<ArrayBuffer> | undefined;

function icon(request: Request): Response {
  iconBytes ??= Uint8Array.from(atob(ICON_PNG_BASE64), (c) => c.charCodeAt(0));
  return new Response(request.method === "HEAD" ? null : iconBytes, {
    status: 200,
    headers: { "content-type": "image/png", "cache-control": "public, max-age=86400", "x-content-type-options": "nosniff" },
  });
}

function home(request: Request, url: URL): Response | undefined {
  if (request.method !== "GET" && request.method !== "HEAD") return undefined;
  if (ICON_PATHS.has(url.pathname)) return icon(request);
  if (url.pathname !== "/") return undefined;
  return text(200, request.method === "HEAD" ? "" : HOME, { "cache-control": "public, max-age=3600", "x-content-type-options": "nosniff" });
}

const entries = new Map<HostProfile, HttpEntry>();
function mcpEntry(profile: HostProfile = "default"): HttpEntry {
  let entry = entries.get(profile);
  if (!entry) {
    entry = createHttpEntry({
      mcpPath: MCP_PATHS[profile],
      allowedHosts: new Set([PUBLIC_HOST]),
      allowedOrigins: new Set(ALLOWED_ORIGINS),
      maxBodyBytes: MAX_BODY_BYTES,
      maxConcurrent: MAX_CONCURRENT,
      factory: () => createCoachServer(profile),
      extraRoutes: home,
      // Le nom de l'erreur seulement : les erreurs d'analyse du SDK citent le corps, qui porte le texte de l'utilisateur.
      onerror: (error) => console.error(`[mcp] ${error.name}`),
    });
    entries.set(profile, entry);
  }
  return entry;
}

/**
 * Le jeton du challenge OpenAI, seul, en texte brut (ni JSON, ni retour à la ligne) ; undefined tant que la variable
 * est vide ou absente (le 404 ordinaire répond alors). Même contrôle d'hôte que le reste du Worker.
 */
function openaiChallenge(request: Request, url: URL, env: WorkerEnv): Response | undefined {
  if (url.pathname !== OPENAI_CHALLENGE_PATH || (request.method !== "GET" && request.method !== "HEAD")) return undefined;
  const token = env.OPENAI_APPS_CHALLENGE?.trim();
  if (!token) return undefined;
  const rejected = hostHeaderValidationResponse(request, [PUBLIC_HOST]);
  if (rejected) return rejected;
  return text(200, request.method === "HEAD" ? "" : token, { "cache-control": "no-store", "x-content-type-options": "nosniff" });
}

async function route(request: Request, url: URL): Promise<Response> {
  const profile = profileOfPath(url.pathname);
  if (!profile || request.method !== "POST") return mcpEntry(profile).fetch(request);
  const path = MCP_PATHS[profile];
  const body = await readCappedBody(request);
  if (!body) {
    console.log(`POST ${path} ? → 413`);
    return jsonRpcError(413, -32600, `Request body too large: at most ${MAX_BODY_BYTES} bytes.`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder().decode(body));
  } catch {
    parsed = undefined;
  }
  const { method, tool } = mcpLabels(parsed);
  const what = `${method === "invalid" ? "?" : method}${tool ? ` ${tool}` : ""}`;
  // Un message par requête, comme le SDK sans état l'attend.
  const response = Array.isArray(parsed)
    ? jsonRpcError(400, -32600, "JSON-RPC batches are not accepted: send one message per request.")
    : await mcpEntry(profile).fetch(new Request(request, { body }));
  console.log(`POST ${path} ${what} → ${response.status}`);
  return response;
}

/** Une requête du Worker, de bout en bout : HTTPS, barre finale, Host et Origin, challenge OpenAI, HSTS. */
export async function handle(request: Request, env: WorkerEnv = {}): Promise<Response> {
  const url = new URL(request.url);
  const redirect = httpsRedirect(url);
  if (redirect) return redirect;
  // Une adresse collée avec une barre finale est servie comme le point MCP (a11y-scan, audit A3-16) : un client
  // MCP ne suit pas toujours une redirection sur POST.
  if (url.pathname.endsWith("/") && TRAILING_SLASH_OK.has(url.pathname.slice(0, -1))) {
    url.pathname = url.pathname.slice(0, -1);
    request = new Request(url, request);
  }
  const challenge = openaiChallenge(request, url, env);
  if (challenge) return withHsts(challenge);
  return withHsts(await route(request, url));
}
