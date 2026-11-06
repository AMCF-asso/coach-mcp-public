// Frappes en clair : « AltGr + O », « ^, puis W ». Règles du site (src/_data/clavier.js) : la touche porte
// la gravure du clavier physique (AZERTY traditionnel), une touche de chiffre se nomme par son chiffre sauf
// avec le Verr. Maj. (« Verr. Maj. + é »), les modificateurs s'écrivent Verr. Maj., AltGr, Maj.
import { AZERTY_GLOBAL, LAYERS, type KeyboardData, type Lang, type Method } from "./data.ts";

export interface Stroke {
  /** Touches pressées ensemble, modificateurs d'abord. */
  keys: string[];
  /** Code de la touche principale (KeyboardEvent.code), pour le widget. */
  code: string;
  layer: string;
}

export interface Keystrokes {
  /** Une ou deux frappes : la touche morte, puis la lettre. */
  strokes: Stroke[];
  text: string;
  deadKey?: { id: string; symbol: string; name: string };
}

const MODIFIERS = {
  fr: { caps: "Verr. Maj.", altgr: "AltGr", shift: "Maj", space: "Espace", then: ", puis " },
  en: { caps: "Caps Lock", altgr: "AltGr", shift: "Shift", space: "Space", then: ", then " },
} as const;

function keyName(layout: KeyboardData, code: string, layer: string, lang: Lang): string {
  const name = layout.keyNames[code];
  if (!name) return code;
  if (code === "Space") return MODIFIERS[lang].space;
  // Le chiffre nomme la touche quand un modificateur l'accompagne (« AltGr + 6 », « Maj + 2 ») ; seule,
  // elle garde sa lettre (« touche ^, puis touche é ») : sur le site, la couche de base n'affiche aucune frappe.
  if (name.digit && !layer.startsWith("Caps") && layer !== "Base") return name.digit;
  return name.engraving;
}

export function stroke(layout: KeyboardData, code: string, layer: string, lang: Lang): Stroke {
  const parts = new Set(layer.split("+"));
  const m = MODIFIERS[lang];
  const keys: string[] = [];
  if (parts.has("Caps")) keys.push(m.caps);
  if (parts.has("AltGr")) keys.push(layout.platform === "macos" ? "Option" : m.altgr);
  if (parts.has("Shift")) keys.push(m.shift);
  keys.push(keyName(layout, code, layer, lang));
  return { keys, code, layer };
}

/** Où se trouve une touche morte : la couche la plus simple qui la porte, sans Verr. Maj. si possible. */
export function deadKeyPosition(layout: KeyboardData, deadKey: string): { code: string; layer: string } | undefined {
  let best: { code: string; layer: string; rank: number } | undefined;
  for (const [code, values] of Object.entries(layout.keymap)) {
    for (let index = 0; index < values.length; index += 1) {
      if (values[index] !== deadKey) continue;
      const layer = LAYERS[index] ?? "Base";
      const rank = (layer.startsWith("Caps") ? 10 : 0) + index;
      if (!best || rank < best.rank) best = { code, layer, rank };
    }
  }
  return best && { code: best.code, layer: best.layer };
}

/** « AltGr + O » ; une touche seule se dit « touche ² » (« ² key »), pour qu'un symbole nu ne passe pas pour le caractère à taper. */
function strokeText(s: Stroke, lang: Lang): string {
  if (s.keys.length > 1) return s.keys.join(" + ");
  return lang === "fr" ? `touche ${s.keys[0]}` : `${s.keys[0]} key`;
}

export function describeMethod(method: Method, lang: Lang, layout: KeyboardData = AZERTY_GLOBAL): Keystrokes {
  const strokes: Stroke[] = [];
  let deadKey: Keystrokes["deadKey"];
  if (method.type === "deadkey" || method.type === "deadkey_activation") {
    const id = method.deadkey ?? "";
    const info = layout.deadKeyInfo[id];
    deadKey = { id, symbol: info?.symbol ?? "◌", name: (lang === "fr" ? info?.nameFr : info?.nameEn) ?? id };
  }
  if (method.type === "deadkey") {
    const position = deadKeyPosition(layout, method.deadkey ?? "");
    if (!position) throw new Error(`Touche morte introuvable : ${method.deadkey}`);
    strokes.push(stroke(layout, position.code, position.layer, lang));
  }
  strokes.push(stroke(layout, method.key, method.layer, lang));
  return { strokes, text: strokes.map((s) => strokeText(s, lang)).join(MODIFIERS[lang].then), ...(deadKey ? { deadKey } : {}) };
}

/** Les mêmes touches physiques, la touche principale nommée d'après la gravure d'une autre disposition
 * (« touche Q » pour le A de l'AZERTY vu d'un QWERTY) ; les modificateurs restent ceux de la frappe. */
export function renameStrokes(keystrokes: Keystrokes, layout: KeyboardData, lang: Lang): string {
  return keystrokes.strokes
    .map((s) => strokeText({ ...s, keys: [...s.keys.slice(0, -1), keyName(layout, s.code, s.layer, lang)] }, lang))
    .join(MODIFIERS[lang].then);
}

/** La méthode recommandée, puis jusqu'à deux autres sans Verr. Maj. (les variantes au Verr. Maj. répètent la même touche). */
export function pickMethods(methods: Method[]): { recommended: Method; others: Method[] } {
  const recommended = methods.find((m) => m.recommended) ?? methods[0];
  if (!recommended) throw new Error("Aucune méthode.");
  const others = methods.filter((m) => m !== recommended && !m.layer.startsWith("Caps")).slice(0, 2);
  return { recommended, others };
}
