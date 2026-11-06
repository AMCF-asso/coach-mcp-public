// Recherche d'un caractère (le caractère lui-même, U+00C9, son nom ou une description) et fiche de frappe.
// L'index des caractères du site fait foi sur la présence d'un caractère dans AZERTY Global (leçon du 2026-09-05).
import { AZERTY_GLOBAL, IDENTITY, LINKS, type CharacterEntry, type KeyboardData, type Lang, type Method } from "./data.ts";
import { fallbacks, type Fallbacks } from "./fallback.ts";
import { describeMethod, pickMethods, type Keystrokes } from "./keys.ts";
import { layoutMethods, otherLayout } from "./layouts.ts";

/** Dispositions que l'utilisateur peut déclarer. Toutes ont leurs données (étape 6 du cadrage, sources/) sauf
 * « unknown ». */
export const LAYOUT_IDS = [
  "azerty-global",
  "azerty-windows",
  "azerty-afnor",
  "azerty-macos",
  "azerty-linux",
  "azerty-belgian",
  "qwerty-us",
  "qwerty-uk",
  "qwertz-de",
  "qwertz-ch",
  "qwerty-es",
  "qwerty-it",
  "qwerty-pt",
  "unknown",
] as const;
export type LayoutId = (typeof LAYOUT_IDS)[number];
export const COVERED_LAYOUTS: ReadonlySet<LayoutId> = new Set(LAYOUT_IDS.filter((id) => id === "azerty-global" || otherLayout(id)));

/** Nom d'une disposition pour l'utilisateur. */
export function layoutName(layout: LayoutId, lang: Lang): string {
  if (layout === "azerty-global") return "AZERTY Global";
  return otherLayout(layout)?.name[lang] ?? layout;
}

/** Ce que le widget dessine pour une disposition couverte autre qu'AZERTY Global. */
export function keyboardOf(layout: LayoutId): { id: LayoutId; keymap: KeyboardData["keymap"]; deadkeys: KeyboardData["deadkeys"]; platform: string } | undefined {
  const data = otherLayout(layout);
  return data && { id: layout, keymap: data.keymap, deadkeys: data.deadkeys, platform: data.platform };
}

const characters = AZERTY_GLOBAL.characters;

function isRealCharacter(key: string): boolean {
  return !key.startsWith("dk:");
}

function codePointOf(char: string): string {
  return [...char].map((c) => "U+" + (c.codePointAt(0) ?? 0).toString(16).toUpperCase().padStart(4, "0")).join(" ");
}

function fold(text: string, keepAccents: boolean): string {
  let t = text.toLowerCase().replace(/[’'\-_]/g, " ");
  if (!keepAccents) t = t.normalize("NFD").replace(/\p{M}/gu, "");
  return t.replace(/\s+/g, " ").trim();
}

interface Candidate {
  char: string;
  score: number;
}

const SEARCHABLE = Object.entries(characters)
  .filter(([char]) => isRealCharacter(char))
  .map(([char, entry]) => ({
    char,
    aliases: [...(entry.frenchAliases ?? []), ...(entry.englishAliases ?? [])],
    names: [entry.unicodeNameFr, entry.unicodeName],
  }));

function scoreText(query: string, target: string, keepAccents: boolean, exact: number): number {
  const q = fold(query, keepAccents);
  const t = fold(target, keepAccents);
  if (!q || !t) return 0;
  if (q === t) return exact;
  // Le pluriel ne change pas la recherche : « guillemets » trouve « guillemet ».
  const singular = (w: string) => (w.length > 3 && w.endsWith("s") ? w.slice(0, -1) : w);
  const words = t.split(" ").map(singular);
  const tokens = q.split(" ").map(singular);
  if (!tokens.every((token) => words.some((word) => word === token || (token.length >= 3 && word.startsWith(token))))) return 0;
  // Tous les mots de la requête sont là : plus la cible est courte, plus elle colle.
  return exact / 2 + (exact / 4) * (tokens.length / words.length);
}

/** Jusqu'à `limit` caractères correspondant à la requête, le meilleur d'abord. */
export function findCharacters(query: string, limit = 5): string[] {
  const q = query.trim();
  if (!q) return [];
  const nfc = q.normalize("NFC");
  if (characters[nfc] && isRealCharacter(nfc)) return [nfc];
  const graphemes = [...new Intl.Segmenter("fr", { granularity: "grapheme" }).segment(nfc)];
  if (graphemes.length === 1) return [nfc]; // un caractère absent de l'index reste une réponse : il est introuvable sur AZERTY Global.
  const hex = /^(?:u\+|U\+|0x)?([0-9a-fA-F]{4,6})$/.exec(q);
  if (hex?.[1] && /^(?:u\+|0x)/i.test(q)) {
    const char = String.fromCodePoint(Number.parseInt(hex[1], 16));
    return [char];
  }
  const ranked: Candidate[] = [];
  for (const item of SEARCHABLE) {
    let score = 0;
    for (const alias of item.aliases) score = Math.max(score, scoreText(q, alias, true, 100), scoreText(q, alias, false, 80));
    for (const name of item.names) score = Math.max(score, scoreText(q, name, true, 90), scoreText(q, name, false, 70));
    if (score > 0) ranked.push({ char: item.char, score });
  }
  // À score égal, la minuscule d'abord (œ et Œ partagent leurs alias), puis l'ordre des points de code.
  const lowerFirst = (c: string) => (c === c.toLowerCase() ? 0 : 1);
  ranked.sort((a, b) => b.score - a.score || lowerFirst(a.char) - lowerFirst(b.char) || a.char.codePointAt(0)! - b.char.codePointAt(0)!);
  return ranked.slice(0, limit).map((c) => c.char);
}

export interface CharacterSheet {
  char: string;
  codePoint: string;
  name: string;
  /** Le caractère existe-t-il sur AZERTY Global ? */
  onAzertyGlobal: boolean;
  layout: LayoutId;
  layoutName: string;
  /** Les données de la disposition de l'utilisateur existent-elles ? */
  layoutCovered: boolean;
  /** Disposition couverte où le caractère n'existe pas. */
  impossibleOnYourLayout?: boolean;
  /** Réserve sur la source de la disposition (macOS : relevé d'OS X 10.9). */
  reserve?: string;
  /** Comment le taper sur la disposition de l'utilisateur, quand elle est couverte et le permet. */
  onYourLayout?: { recommended: Keystrokes; others: Keystrokes[] };
  /** Comment le taper avec AZERTY Global, quand l'utilisateur ne l'a pas encore. */
  withAzertyGlobal?: { recommended: Keystrokes; others: Keystrokes[] };
  fallbacks: Fallbacks;
  /** Conseil d'AZERTY Global : seulement quand il apporte quelque chose (décision du 2026-10-04). */
  suggestion?: { text: string; download: string; tester: string };
}

function methodsOf(methods: Method[], lang: Lang, layout: KeyboardData = AZERTY_GLOBAL): { recommended: Keystrokes; others: Keystrokes[] } {
  const { recommended, others } = pickMethods(methods);
  return { recommended: describeMethod(recommended, lang, layout), others: others.map((m) => describeMethod(m, lang, layout)) };
}

function displayName(char: string, entry: CharacterEntry | undefined, lang: Lang): string {
  if (!entry) return codePointOf(char);
  const alias = lang === "fr" ? entry.frenchAliases?.[0] : entry.englishAliases?.[0];
  const official = lang === "fr" ? entry.unicodeNameFr : entry.unicodeName;
  return alias ? `${alias} (${official.toLowerCase()})` : official.toLowerCase();
}

export function characterSheet(char: string, layout: LayoutId, lang: Lang): CharacterSheet {
  const entry = isRealCharacter(char) ? characters[char] : undefined;
  const covered = COVERED_LAYOUTS.has(layout);
  const sheet: CharacterSheet = {
    char,
    codePoint: codePointOf(char),
    name: displayName(char, entry, lang),
    onAzertyGlobal: Boolean(entry),
    layout,
    layoutName: layoutName(layout, lang),
    layoutCovered: covered,
    fallbacks: fallbacks(char),
  };
  if (layout === "azerty-global") {
    if (entry) sheet.onYourLayout = methodsOf(entry.methods, lang);
    return sheet;
  }
  const other = otherLayout(layout);
  if (other) {
    if (other.reserve) sheet.reserve = other.reserve[lang];
    const methods = layoutMethods(layout, char);
    if (methods.length > 0) {
      sheet.onYourLayout = methodsOf(methods, lang, other);
      return sheet;
    }
    sheet.impossibleOnYourLayout = true;
  }
  // Caractère impossible sur une disposition connue : la frappe avec AZERTY Global accompagne les solutions de
  // repli. Le conseil ne vient que là (décision du 2026-10-04). Disposition inconnue : on la demande, sans rien
  // proposer (é se tape sur tout AZERTY ; AZERTY Global n'y apporterait rien).
  if (entry && sheet.impossibleOnYourLayout) {
    sheet.withAzertyGlobal = methodsOf(entry.methods, lang);
    sheet.suggestion = { text: IDENTITY[lang], download: LINKS.download[lang], tester: LINKS.tester[lang] };
  }
  return sheet;
}

function strokesLine(k: Keystrokes, lang: Lang): string {
  if (!k.deadKey) return k.text;
  return lang === "fr" ? `${k.text} (touche morte ${k.deadKey.name.toLowerCase()} ${k.deadKey.symbol})` : `${k.text} (${k.deadKey.name.toLowerCase()} dead key ${k.deadKey.symbol})`;
}

/** Résumé en clair pour le modèle ; les données complètes partent dans `structuredContent`. */
export function sheetText(sheet: CharacterSheet, lang: Lang): string {
  const lines: string[] = [];
  const fr = lang === "fr";
  lines.push(`${sheet.char} — ${sheet.name} — ${sheet.codePoint}`);
  const where = sheet.layout === "azerty-global" ? "" : ` (${sheet.layoutName}${sheet.reserve ? `, ${sheet.reserve}` : ""})`;
  if (sheet.onYourLayout) {
    lines.push((fr ? `Sur votre clavier${where} : ` : `On your keyboard${where}: `) + strokesLine(sheet.onYourLayout.recommended, lang));
    for (const other of sheet.onYourLayout.others) lines.push((fr ? "Autre façon : " : "Other way: ") + strokesLine(other, lang));
  } else if (sheet.layout === "azerty-global") {
    lines.push(fr ? "Ce caractère n'est pas sur AZERTY Global." : "This character is not on AZERTY Global.");
  } else if (sheet.impossibleOnYourLayout) {
    lines.push(fr ? `Impossible à taper sur votre clavier${where}.` : `Not available on your keyboard${where}.`);
  } else if (!sheet.layoutCovered) {
    lines.push(
      fr
        ? "Disposition inconnue : demander laquelle l'utilisateur emploie. Ne pas inventer de frappe."
        : "Unknown layout: ask which one the user has. Do not invent a keystroke.",
    );
  }
  // Le code Alt ne sert que sous Windows.
  const alt = otherLayout(sheet.layout)?.platform === "macos" || otherLayout(sheet.layout)?.platform === "linux" ? undefined : sheet.fallbacks.windowsAltCode;
  if (!sheet.onYourLayout) {
    if (alt) lines.push(fr ? `Sous Windows : ${alt}, sur le pavé numérique.` : `On Windows: ${alt}, on the numeric keypad.`);
    lines.push(fr ? `À copier : ${sheet.fallbacks.copy}` : `To copy: ${sheet.fallbacks.copy}`);
  }
  if (sheet.withAzertyGlobal && sheet.suggestion) {
    lines.push((fr ? "Avec AZERTY Global : " : "With AZERTY Global: ") + strokesLine(sheet.withAzertyGlobal.recommended, lang));
    lines.push((fr ? "Télécharger : " : "Download: ") + sheet.suggestion.download);
  }
  return lines.join("\n");
}
