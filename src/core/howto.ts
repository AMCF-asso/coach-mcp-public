// Comment taper un texte court : une fiche par caractère distinct, hors lettres de A à Z, chiffres et blancs.
import { characterSheet, type CharacterSheet, type LayoutId } from "./characters.ts";
import type { Lang } from "./data.ts";

/** Longueur maximale du texte : la même valeur plafonne l'entrée de l'outil, la lecture et la description. */
export const MAX_TEXT_LENGTH = 2000;
export const MAX_DISTINCT = 60;
const PLAIN = /^[A-Za-z0-9\s]$/u;

export interface HowToResult {
  sheets: CharacterSheet[];
  /** Caractères absents d'AZERTY Global : seules les solutions de repli restent. */
  notOnAzertyGlobal: string[];
  /** Caractères impossibles sur la disposition de l'utilisateur, quand elle est couverte. */
  impossibleOnYourLayout: string[];
  /** Vrai si la réponse est partielle : texte lu en partie (`textCut`) ou caractères distincts en trop (`omittedDistinct`). */
  truncated: boolean;
  /** Le texte, une fois normalisé en NFC, dépassait `MAX_TEXT_LENGTH` : seul le début a été lu. */
  textCut: boolean;
  /** Caractères distincts non détaillés au-delà de `MAX_DISTINCT`. */
  omittedDistinct: number;
}

export function howToType(text: string, layout: LayoutId, lang: Lang): HowToResult {
  const seen = new Set<string>();
  const segmenter = new Intl.Segmenter("fr", { granularity: "grapheme" });
  const normalized = text.normalize("NFC");
  const textCut = normalized.length > MAX_TEXT_LENGTH;
  for (const { segment } of segmenter.segment(normalized.slice(0, MAX_TEXT_LENGTH))) {
    if (!PLAIN.test(segment)) seen.add(segment);
  }
  const distinct = [...seen];
  const omittedDistinct = Math.max(0, distinct.length - MAX_DISTINCT);
  const sheets = distinct.slice(0, MAX_DISTINCT).map((char) => characterSheet(char, layout, lang));
  return {
    sheets,
    notOnAzertyGlobal: sheets.filter((s) => !s.onAzertyGlobal).map((s) => s.char),
    impossibleOnYourLayout: sheets.filter((s) => s.impossibleOnYourLayout).map((s) => s.char),
    truncated: textCut || omittedDistinct > 0,
    textCut,
    omittedDistinct,
  };
}

/** Phrase qui dit ce que la réponse ne couvre pas ; vide si elle est complète. */
export function partialNote(result: HowToResult, lang: Lang): string {
  const fr = lang === "fr";
  const notes: string[] = [];
  if (result.textCut) {
    notes.push(fr ? `Seuls les ${MAX_TEXT_LENGTH} premiers caractères du texte ont été lus.` : `Only the first ${MAX_TEXT_LENGTH} characters of the text were read.`);
  }
  if (result.omittedDistinct > 0) {
    notes.push(
      fr
        ? `Seuls les ${MAX_DISTINCT} premiers caractères distincts sont détaillés ; ${result.omittedDistinct} autres ne le sont pas.`
        : `Only the first ${MAX_DISTINCT} distinct characters are detailed; ${result.omittedDistinct} more are not.`,
    );
  }
  return notes.length ? `${fr ? "Réponse partielle. " : "Partial answer. "}${notes.join(" ")}` : "";
}
