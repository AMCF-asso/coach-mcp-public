// Point d'entrée MCP local (stdio). Rien n'est écrit sur stdout en dehors du protocole.
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { createCoachServer } from "./server.ts";

serveStdio(() => createCoachServer());
