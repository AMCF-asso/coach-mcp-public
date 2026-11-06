// HTTPS seulement, repris d'a11y-scan (src/worker/https.ts, 2026-10-04) : le Worker redirige lui-même le HTTP
// et envoie HSTS en HTTPS, sans dépendre des réglages de la zone. Un jour d'abord : l'allonger quand le domaine
// aura tourné un moment en HTTPS seul. Sous `wrangler dev`, le Worker voit https (`dev.upstream_protocol`).
export const HSTS_HEADER = "max-age=86400";

/** 308 vers la même adresse en https (méthode et corps gardés pour POST /mcp) ; undefined en HTTPS. */
export function httpsRedirect(url: URL): Response | undefined {
  if (url.protocol !== "http:") return undefined;
  const target = new URL(url.href);
  target.protocol = "https:";
  // Cloudflare sert aussi le HTTP sur 8080, 8880…, sans jumeau HTTPS : toujours vers 443.
  target.port = "";
  return new Response(null, { status: 308, headers: { location: target.href } });
}

/** La même réponse avec l'en-tête HSTS ; le corps (JSON ou flux d'événements) passe tel quel. */
export function withHsts(response: Response): Response {
  const out = new Response(response.body, response);
  out.headers.set("strict-transport-security", HSTS_HEADER);
  return out;
}
