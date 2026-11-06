// Frappes des autres dispositions, calculées depuis leur table (data/layouts.json) : directes, puis touche
// morte suivie d'un caractère. AZERTY Global garde l'index du site, qui fait foi (leçon du 2026-09-05).
import { LAYERS, OTHER_LAYOUTS, type KeyboardData, type Method, type OtherLayoutData } from "./data.ts";

/** Coût d'une couche : la frappe recommandée est la moins coûteuse, une touche morte compte 10 de plus. */
const LAYER_COST: Record<string, number> = {
  Base: 0,
  Shift: 1,
  AltGr: 2,
  "Shift+AltGr": 3,
  Caps: 4,
  "Caps+Shift": 5,
  "Caps+AltGr": 6,
  "Caps+Shift+AltGr": 7,
};
const DEAD_KEY_COST = 10;

export function otherLayout(id: string): OtherLayoutData | undefined {
  return Object.hasOwn(OTHER_LAYOUTS, id) ? OTHER_LAYOUTS[id] : undefined;
}

const isDeadKey = (value: string) => value.startsWith("dk_");
const printable = (value: string) => [...value].every((c) => (c.codePointAt(0) ?? 0) >= 0x20 && c !== "\u007f");

interface Ranked {
  method: Method;
  cost: number;
}

function buildIndex(layout: KeyboardData): Map<string, Method[]> {
  const ranked = new Map<string, Ranked[]>();
  const add = (char: string, method: Method, cost: number) => {
    const list = ranked.get(char) ?? [];
    list.push({ method, cost });
    ranked.set(char, list);
  };
  // Frappes directes, et position la moins coûteuse de chaque touche morte.
  const direct = new Map<string, Array<{ key: string; layer: string; cost: number }>>();
  const deadKeyCost = new Map<string, number>();
  for (const [key, values] of Object.entries(layout.keymap)) {
    values.forEach((value, index) => {
      if (typeof value !== "string" || !value) return;
      const layer = LAYERS[index] ?? "Base";
      const cost = LAYER_COST[layer] ?? 9;
      if (isDeadKey(value)) {
        deadKeyCost.set(value, Math.min(deadKeyCost.get(value) ?? Infinity, cost));
        return;
      }
      if (!printable(value)) return;
      const positions = direct.get(value) ?? [];
      positions.push({ key, layer, cost });
      direct.set(value, positions);
      add(value, { type: "direct", key, layer }, cost);
    });
  }
  for (const [deadkey, table] of Object.entries(layout.deadkeys)) {
    const own = deadKeyCost.get(deadkey);
    if (own === undefined) continue; // touche morte seulement atteinte par une autre touche morte
    for (const [input, output] of Object.entries(table)) {
      if (!printable(output)) continue;
      for (const p of direct.get(input) ?? []) add(output, { type: "deadkey", deadkey, key: p.key, layer: p.layer }, DEAD_KEY_COST + own + p.cost);
    }
  }
  const index = new Map<string, Method[]>();
  for (const [char, list] of ranked) {
    list.sort((a, b) => a.cost - b.cost);
    index.set(
      char,
      list.map((r, i) => (i === 0 ? { ...r.method, recommended: true } : r.method)),
    );
  }
  return index;
}

const cache = new Map<string, Map<string, Method[]>>();

/** Les façons de taper `char` sur la disposition `id`, la recommandée d'abord ; vide s'il est impossible. */
export function layoutMethods(id: string, char: string): Method[] {
  const layout = otherLayout(id);
  if (!layout) return [];
  let index = cache.get(id);
  if (!index) {
    index = buildIndex(layout);
    cache.set(id, index);
  }
  return index.get(char.normalize("NFC")) ?? [];
}
