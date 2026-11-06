// Deux dispositions face à face (cadrage, `compare_layouts`) : les caractères dont la frappe change, rangés par
// fréquence dans un texte français (data/Frequences-caracteres.csv du site), puis le premier exercice.
import { characterSheet, layoutName, type CharacterSheet, type LayoutId } from "./characters.ts";
import { AZERTY_GLOBAL, FREQUENCIES, type KeyboardData, type Lang } from "./data.ts";
import { renameStrokes, type Keystrokes } from "./keys.ts";
import { otherLayout } from "./layouts.ts";
import { allExercises, trackLayout, type Track } from "./lessons.ts";

export interface KeyChange {
  char: string;
  name: string;
  /** Part du caractère dans un texte français, en pour cent. */
  frequency: number;
  /** `null` : impossible sur cette disposition (code Alt ou copier-coller). */
  from: Keystrokes | null;
  to: Keystrokes | null;
  /** La frappe cible, nommée d'après la gravure du clavier d'origine, quand le nom change (« touche Q »). */
  toOnFromKeys?: string;
}

export interface Comparison {
  from: LayoutId;
  to: LayoutId;
  fromName: string;
  toName: string;
  /** Caractères dont la frappe change, le plus fréquent d'abord. */
  changes: KeyChange[];
  /** Caractères comparés qui se tapent de la même façon. */
  unchanged: number;
  /** Premier exercice du parcours qui mène à `to`. */
  firstExercise: { id: string; track: Track; instruction: string; content: string };
  /** Fiches des changements les plus fréquents, sur la disposition cible, pour le widget. */
  sheets: CharacterSheet[];
}

/** Même frappe : mêmes touches physiques, mêmes couches. */
function sameStrokes(a: Keystrokes | null, b: Keystrokes | null): boolean {
  if (!a || !b) return a === b;
  return a.strokes.length === b.strokes.length && a.strokes.every((s, i) => s.code === b.strokes[i]!.code && s.layer === b.strokes[i]!.layer);
}

const COMBINING = /^\p{M}$/u; // les accents seuls de la liste : comptés avec leurs lettres (ê, ë…)
const MAX_SHEETS = 8;

export function compareLayouts(from: LayoutId, to: LayoutId, lang: Lang): Comparison {
  const changes: KeyChange[] = [];
  let unchanged = 0;
  const fromKeyboard: KeyboardData = from === "azerty-global" ? AZERTY_GLOBAL : otherLayout(from)!;
  const sorted = Object.entries(FREQUENCIES).sort((a, b) => b[1] - a[1]);
  for (const [char, share] of sorted) {
    if (COMBINING.test(char)) continue;
    const a = characterSheet(char, from, lang);
    const b = characterSheet(char, to, lang);
    const ka = a.onYourLayout?.recommended ?? null;
    const kb = b.onYourLayout?.recommended ?? null;
    if (!ka && !kb) continue;
    if (sameStrokes(ka, kb)) {
      unchanged += 1;
      continue;
    }
    const change: KeyChange = { char, name: b.name, frequency: Math.round(share * 10000) / 100, from: ka, to: kb };
    const renamed = kb && renameStrokes(kb, fromKeyboard, lang);
    if (renamed && renamed !== kb.text) change.toOnFromKeys = renamed;
    changes.push(change);
  }
  // Vers AZERTY Global, ses propres leçons ; vers un autre AZERTY, la base commune du parcours expatrié.
  const track: Track = to === "azerty-global" ? "azerty-global" : "expat";
  const first = allExercises(track)[0]!;
  const sheets = changes
    .filter((c) => c.to)
    .slice(0, MAX_SHEETS)
    .map((c) => characterSheet(c.char, to, lang));
  return {
    from,
    to,
    fromName: layoutName(from, lang),
    toName: layoutName(trackLayout(track, to), lang),
    changes,
    unchanged,
    firstExercise: {
      id: first.id,
      track,
      instruction: lang === "fr" ? first.exercise.instruction : first.exercise.instructionEn,
      content: first.exercise.content,
    },
    sheets,
  };
}
