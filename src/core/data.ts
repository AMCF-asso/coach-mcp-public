// Données produites par scripts/build-data.ts depuis la branche `refonte` du site.
// Import JSON plutôt que lecture de fichier : le même code tourne sous Node et sous Workers.
import layoutJson from "../../data/azerty-global.json" with { type: "json" };
import layoutsJson from "../../data/layouts.json" with { type: "json" };
import lessonsJson from "../../data/lessons.json" with { type: "json" };

export type Lang = "fr" | "en";

export interface Method {
  type: "direct" | "deadkey" | "deadkey_activation";
  key: string;
  layer: string;
  deadkey?: string;
  recommended?: boolean;
}

export interface CharacterEntry {
  codePoint: string;
  unicodeName: string;
  unicodeNameFr: string;
  frenchAliases?: string[];
  englishAliases?: string[];
  displayChar?: string;
  methods: Method[];
}

export interface DeadKeyInfo {
  symbol: string;
  nameFr: string;
  nameEn: string;
}

/** Ce qu'il faut pour nommer et dessiner les touches d'une disposition. */
export interface KeyboardData {
  /** Code de touche → 8 couches : Base, Shift, Caps, Caps+Shift, AltGr, Shift+AltGr, Caps+AltGr, Caps+Shift+AltGr. */
  keymap: Record<string, Array<string | null>>;
  deadkeys: Record<string, Record<string, string>>;
  deadKeyInfo: Record<string, DeadKeyInfo>;
  keyNames: Record<string, { engraving: string; digit: string | null }>;
  /** macOS : la touche AltGr s'appelle Option. */
  platform?: "windows" | "macos" | "linux";
}

export interface LayoutData extends KeyboardData {
  meta: { branch: string; commit: string; indexGenerated: string; lessonsGenerated: string };
  name: string;
  version: string;
  characters: Record<string, CharacterEntry>;
}

/** Une autre disposition (data/layouts.json) : pas d'index de caractères, il se calcule depuis `keymap`. */
export interface OtherLayoutData extends KeyboardData {
  meta: Record<string, unknown> & { source: string };
  name: Record<Lang, string>;
  platform: "windows" | "macos" | "linux";
  /** Réserve à rappeler avec chaque frappe (macOS : relevé d'OS X 10.9). */
  reserve?: Record<Lang, string>;
}

export interface Exercise {
  type: string;
  instruction: string;
  instructionEn: string;
  content: string;
  hintMethod?: string;
}

export interface Lesson {
  id: string;
  title: string;
  titleEn: string;
  description: string;
  descriptionEn: string;
  characters: string[];
  exercises: Exercise[];
}

export interface Module {
  id: string;
  title: string;
  titleEn: string;
  description: string;
  descriptionEn: string;
  icon?: string;
  lessons: Lesson[];
}

export const AZERTY_GLOBAL = layoutJson as unknown as LayoutData;
export const OTHER_LAYOUTS = (layoutsJson as unknown as { layouts: Record<string, OtherLayoutData> }).layouts;
/** Fréquence des caractères dans un texte français (part de 0 à 1). */
export const FREQUENCIES = (layoutsJson as unknown as { frequencies: Record<string, number> }).frequencies;
export const LESSONS = (lessonsJson as unknown as { modules: Module[] }).modules;

export const LAYERS = ["Base", "Shift", "Caps", "Caps+Shift", "AltGr", "Shift+AltGr", "Caps+AltGr", "Caps+Shift+AltGr"] as const;

export const LINKS = {
  download: { fr: "https://azerty.global/download", en: "https://azerty.global/en/download" },
  tester: { fr: "https://azerty.global/testeur", en: "https://azerty.global/testeur" },
} as const;

/** Présentation d'AZERTY Global ; jamais « aucune lettre ne bouge ».
 * fr : phrase d'identité validée par Antoine (mémoire AZERTY du 2026-09-26).
 * en : phrase publiée sur le site anglais (branche `refonte`, src/pages/en). */
export const IDENTITY = {
  fr: "AZERTY Global est un AZERTY amélioré, gratuit et libre, indépendant de la norme AFNOR NF Z71-300 : les lettres A à Z et les chiffres ne bougent pas, et la ponctuation et les symboles restent presque tous à leur place ; seuls quelques-uns changent, pour être plus faciles à atteindre.",
  en: "AZERTY Global is an improved French keyboard layout for Windows, macOS and Linux: the same AZERTY base, cleaner punctuation, easy accented capitals, accessible programming symbols and broad multilingual coverage.",
} as const;
