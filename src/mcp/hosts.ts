// Profils d'hôte : un même serveur, trois adresses. `_meta.ui.domain` est lu par Claude et par ChatGPT sous la
// même clé, mais chacun en exige un format différent (spec MCP Apps : « host-dependent »), et le serveur est sans
// état : à `resources/read`, il ne sait pas qui l'appelle (ni `clientInfo`, ni un User-Agent fiable). L'adresse
// utilisée par l'hôte désigne donc son profil.
//
// - `/mcp`        : profil `default`, sans `ui.domain` (origine de bac à sable par défaut de l'hôte). Valable partout
//                   ; Claude n'en demande un que pour une appli qui lance son propre OAuth, ce qu'AZERTY Coach ne fait pas.
// - `/mcp/openai` : profil `openai`, `ui.domain` = origine du serveur (ChatGPT et Codex ; obligatoire à la soumission
//                   d'un plugin avec interface, une valeur unique par plugin).
// - `/mcp/claude` : profil `claude`, `ui.domain` = 32 premiers hex du SHA-256 de l'URL exacte, puis
//                   `.claudemcpcontent.com`. Claude refuse de rendre l'appli si la valeur ne correspond pas à l'URL configurée.
export const PUBLIC_HOST = "mcp.azerty.global";
export const PUBLIC_ORIGIN = `https://${PUBLIC_HOST}`;

export type HostProfile = "default" | "openai" | "claude";

export const MCP_PATHS: Record<HostProfile, string> = { default: "/mcp", openai: "/mcp/openai", claude: "/mcp/claude" };

/** Valeurs de `ui.domain` par profil. Celle de Claude est une constante (test/hosts.test.ts la recalcule) : pas de SHA-256 à l'exécution. */
export const UI_DOMAIN: Record<HostProfile, string | undefined> = {
  default: undefined,
  openai: PUBLIC_ORIGIN,
  claude: "384eeba0eae24b199fbe84feef8fc7aa.claudemcpcontent.com",
};

/** Profil d'un chemin exact (sans barre finale) ; undefined hors des points MCP. */
export function profileOfPath(pathname: string): HostProfile | undefined {
  return (Object.keys(MCP_PATHS) as HostProfile[]).find((profile) => MCP_PATHS[profile] === pathname);
}
