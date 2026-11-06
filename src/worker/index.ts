// Worker Cloudflare d'AZERTY Coach, sur https://mcp.azerty.global/mcp (wrangler.jsonc). Tout est dans
// entry.ts, testé sous Node ; ce fichier ne porte que l'export que Workers attend.
import { handle, type WorkerEnv } from "./entry.ts";

export default {
  fetch: (request: Request, env: WorkerEnv): Promise<Response> => handle(request, env),
} satisfies ExportedHandler<WorkerEnv>;
