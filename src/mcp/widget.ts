// Widget clavier (MCP Apps) : une ressource ui:// que l'hôte affiche dans une iframe à côté du résultat des
// outils qui la désignent. Le HTML vient de data/widget.json (scripts/build-widget.ts) ; son empreinte entre
// dans l'URI, pour que l'hôte ne garde pas en cache une version périmée.
import { RESOURCE_MIME_TYPE, registerAppResource } from "@modelcontextprotocol/ext-apps/server";
import type { McpServer } from "@modelcontextprotocol/server";
import widgetJson from "../../data/widget.json" with { type: "json" };
import { UI_DOMAIN, type HostProfile } from "./hosts.ts";

export const WIDGET_URI = `ui://azerty-coach/keyboard-${widgetJson.hash}.html`;
export const WIDGET_HTML: string = widgetJson.html;
/** Icône du serveur en base64 (PNG, favicon du site), copiée par scripts/build-widget.ts. */
export const ICON_PNG_BASE64: string = widgetJson.icon;

/** Métadonnées d'un outil qui s'affiche avec le clavier ; la clé `ui/resourceUri` sert aux hôtes plus anciens. */
export const WIDGET_TOOL_META = { ui: { resourceUri: WIDGET_URI }, "ui/resourceUri": WIDGET_URI } as const;

/**
 * Métadonnées de la ressource. Aucune ressource externe : CSP déclarée sans domaine autorisé. ChatGPT ne lit que sa
 * clé `openai/widgetCSP` (sinon badge « CSP off », widget sans politique) ; les deux déclarations viennent des mêmes
 * listes. `ui.domain` dépend de l'hôte (src/mcp/hosts.ts) ; ChatGPT a aussi son alias `openai/widgetDomain`.
 */
export function widgetResourceMeta(profile: HostProfile = "default") {
  const connectDomains: string[] = [];
  const resourceDomains: string[] = [];
  const domain = UI_DOMAIN[profile];
  return {
    ui: { prefersBorder: true, csp: { connectDomains, resourceDomains }, ...(domain ? { domain } : {}) },
    "openai/widgetCSP": { connect_domains: connectDomains, resource_domains: resourceDomains },
    "openai/widgetPrefersBorder": true,
    ...(domain && profile === "openai" ? { "openai/widgetDomain": domain } : {}),
  };
}

export function registerKeyboardWidget(server: McpServer, profile: HostProfile = "default"): void {
  const _meta = widgetResourceMeta(profile);
  registerAppResource(
    server,
    "AZERTY Global keyboard",
    WIDGET_URI,
    { description: "Interactive AZERTY Global keyboard showing which keys type a character.", _meta },
    async () => ({ contents: [{ uri: WIDGET_URI, mimeType: RESOURCE_MIME_TYPE, text: WIDGET_HTML, _meta }] }),
  );
}
