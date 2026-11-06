// Produit data/widget.json : le widget clavier (widget/keyboard.html) en une seule page autonome.
// L'iframe de l'hôte bloque toute ressource externe : le clavier du testeur (tester/keyboard.js et ses
// deux modules), sa feuille de style, les polices du site, le pont MCP Apps et la disposition y sont
// inlinés. Source : la branche `main` du site, comme scripts/build-data.ts (scripts/site-source.ts).
// `--check` compare sans écrire.
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { Script } from "node:vm";
import { branch, commit, root, source } from "./site-source.ts";

const checkOnly = process.argv.includes("--check");

const read = (path: string) => readFileSync(join(source, path), "utf8");
const fontUrl = (file: string) => `url("data:font/woff2;base64,${readFileSync(join(source, "assets", "fonts", file)).toString("base64")}")`;
// Un `</script` dans un script inliné fermerait la balise : on l'échappe, sans effet sur le code.
const inlineScript = (code: string) => code.replace(/<\/(script)/gi, "<\\/$1").replace(/<!--/g, "<\\!--");

/** Remplace un marqueur du gabarit, qui doit y figurer une seule fois. Fonction de remplacement : les `$` restent tels quels. */
function fill(html: string, marker: string, value: string): string {
  const parts = html.split(marker);
  if (parts.length !== 2) throw new Error(`Marqueur ${marker} : ${parts.length - 1} occurrence(s) dans widget/keyboard.html`);
  return parts[0] + value + parts[1];
}

// 1. Le clavier : trois modules ES réunis en un script, sans import ni export.
function stripExports(code: string, file: string): string {
  const out = code.replace(/^export\s+(?=(const|let|function|class)\s)/gm, "");
  if (/^\s*export\b/m.test(out)) throw new Error(`Export non pris en charge dans ${file}`);
  return out;
}
const keyboardSource = read("tester/keyboard.js");
const imports = keyboardSource.match(/^import .*$/gm) ?? [];
if (imports.length !== 2 || !imports.every((l) => /from '\.\/deadkeys\.js|from '\.\.\/js\/tester-i18n\.js/.test(l))) {
  throw new Error(`Imports inattendus dans tester/keyboard.js :\n${imports.join("\n")}`);
}
const keyboardBody = keyboardSource.replace(/^import .*$/gm, "").replace(/^export \{[^}]*\};?\s*$/m, "");
if (/^\s*(import|export)\b/m.test(keyboardBody)) throw new Error("Import ou export restant dans tester/keyboard.js");
// Gravures des touches mortes : celles du clavier v2 du site (GRAVURES_MORTES, src/_data/clavier.js), tous les
// accents sur ◌ (choix d'Antoine, 01/10 et 11/10). Le testeur v1 n'y pose que 4 marques : les autres, gravées
// en forme d'espacement (˙ ¸ ¯ ˘…), restaient à leur hauteur typographique, hautes ou basses dans leur coin
// (retour d'Antoine, 22/10). Affichage seulement : getDeadKeySymbol, le symbole tapé, ne change pas.
const gravuresSource = read("src/_data/clavier.js").match(/const GRAVURES_MORTES = \{([^}]*)\};/)?.[1] ?? "";
const gravures: Record<string, string> = Object.fromEntries([...gravuresSource.matchAll(/(dk_\w+):\s*'([^']+)'/g)].map((m) => [m[1], m[2]]));
if (Object.keys(gravures).length < 19 || !Object.values(gravures).every((g) => /^◌[̀-ͯ]+$/u.test(g))) {
  throw new Error(`GRAVURES_MORTES illisible dans src/_data/clavier.js : ${JSON.stringify(gravures)}`);
}
const keyboardJs = [
  stripExports(read("js/tester-i18n.js"), "js/tester-i18n.js"),
  stripExports(read("tester/deadkeys.js"), "tester/deadkeys.js"),
  `Object.assign(DEAD_KEY_GRAVURES, ${JSON.stringify(gravures)});`,
  keyboardBody,
  "globalThis.AGKeyboard = { AZERTYKeyboard, setTesterLang };",
].join("\n");
new Script(`"use strict";\n${keyboardJs}`); // collision de noms ou erreur de syntaxe : échec ici, pas dans l'iframe

// 2. Sa feuille de style : la seule police qu'elle charge (AG Clavier, ◌ et marques) passe en data: URL.
const keyboardCss = read("tester/keyboard.css").replace(/url\("\/assets\/fonts\/(ag-clavier-400\.woff2)"\)/g, (_, file) => fontUrl(file));
const remoteUrls = keyboardCss.match(/url\((?!["']?data:)[^)]*\)/g);
if (remoteUrls) throw new Error(`URL externe dans tester/keyboard.css : ${remoteUrls.join(", ")}`);

// 3. Les polices du site (css/v2/fontes.css) : Literata 600 pour le caractère, AG Texte 400 et 600 pour le texte
// (latin et latin-ext ; le fichier « reste », vietnamien, n'est pas embarqué : le widget n'en écrit pas).
const WIDGET_FONTS = [
  "literata-600-latin.woff2",
  "literata-600-latin-ext.woff2",
  "ag-texte-400-latin.woff2",
  "ag-texte-400-latin-ext.woff2",
  "ag-texte-600-latin.woff2",
  "ag-texte-600-latin-ext.woff2",
];
const fontFaces = read("css/v2/fontes.css").match(/@font-face\s*\{[^}]*\}/g) ?? [];
const fontsCss = WIDGET_FONTS.map((file) => {
  const face = fontFaces.find((f) => f.includes(`/assets/fonts/${file}"`));
  if (!face) throw new Error(`@font-face introuvable dans css/v2/fontes.css : ${file}`);
  return face.replace(/url\("\/assets\/fonts\/[^"]+"\)/, () => fontUrl(file)).replace(/font-display:\s*swap/, "font-display: block");
}).join("\n");

// 4. Le pont MCP Apps (classe App) : le paquet autonome, dont l'export final devient globalThis.ExtApps.
const bundlePath = createRequire(import.meta.url).resolve("@modelcontextprotocol/ext-apps/app-with-deps");
const extAppsDir = resolve(dirname(bundlePath), "..", "..");
const extAppsVersion: string = JSON.parse(readFileSync(join(extAppsDir, "package.json"), "utf8")).version;
const bundle = readFileSync(bundlePath, "utf8");
const exportMatch = bundle.match(/export\{([^}]*)\};?\s*$/);
if (!exportMatch) throw new Error("Export final introuvable dans app-with-deps.js");
const exported = exportMatch[1]!.split(",").map((item) => {
  const [local, name = local] = item.trim().split(/\s+as\s+/);
  return `${name}:${local}`;
});
const extAppsJs = bundle.slice(0, exportMatch.index) + `globalThis.ExtApps={${exported.join(",")}};`;
for (const name of ["App", "applyHostStyleVariables"]) {
  if (!exported.some((e) => e.startsWith(`${name}:`))) throw new Error(`${name} absent du pont MCP Apps ${extAppsVersion}`);
}

// 5. La disposition AZERTY Global, sous la forme que setLayout attend.
const layout = JSON.parse(read("tester/azerty-global.json"));
const layoutJson = JSON.stringify({ keymap: layout.keymap, deadkeys: layout.deadkeys }).replace(/</g, "\\u003c");

let html = readFileSync(join(root, "widget", "keyboard.html"), "utf8");
html = fill(html, "/*__FONTS_CSS__*/", fontsCss);
html = fill(html, "/*__KEYBOARD_CSS__*/", keyboardCss);
html = fill(html, "/*__EXT_APPS_BUNDLE__*/", inlineScript(extAppsJs));
html = fill(html, "/*__KEYBOARD_JS__*/", inlineScript(keyboardJs));
html = fill(html, "/*__LAYOUT_JSON__*/null", layoutJson);
const external = html.match(/(?:src|href)=["']?(?:https?:)?\/\/|url\(["']?(?:https?:)?\/\/|["']\/assets\//g);
if (external) throw new Error(`Ressource externe dans le widget : ${[...new Set(external)].join(", ")}`);

// 6. L'icône du serveur (favicon du site, PNG 200 × 200) : le Worker la sert sur sa propre origine, que les hôtes
// lisent pour `serverInfo.icons` et `/favicon.ico` (src/worker/entry.ts).
const icon = readFileSync(join(source, "assets", "favicon-azerty-global.png")).toString("base64");

const hash = createHash("sha256").update(html).digest("hex").slice(0, 12);
const output = { meta: { branch, commit, extApps: extAppsVersion }, hash, html, icon };
const path = join(root, "data", "widget.json");
const text = JSON.stringify(output) + "\n";
let previous = "";
try {
  previous = readFileSync(path, "utf8");
} catch {}
const comparable = (t: string) => t.replace(/"commit":"[0-9a-f]+"/, "");
const stale = comparable(previous) !== comparable(text);
if (stale && !checkOnly) writeFileSync(path, text);
console.log(`${branch}@${commit} : widget ${hash}, ${Math.round(html.length / 1024)} Ko${checkOnly ? (stale ? ", périmé" : ", à jour") : ""}.`);
if (checkOnly && stale) process.exit(1);
