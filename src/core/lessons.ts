// Deux parcours. « azerty-global » : les leçons d'AZERTY Global (tester/lessons.json de la branche `refonte`,
// sans le module « 30 millions »). « expat » : la base commune des AZERTY pour qui vient d'un autre clavier
// (expat.ts), avec AZERTY Global proposé seulement à la fin. Un exercice se désigne par `module/leçon/numéro`,
// numéro à partir de 1 ; les identifiants de module sont uniques entre les parcours.
import { characterSheet, layoutName, type LayoutId } from "./characters.ts";
import { IDENTITY, LESSONS, LINKS, type Exercise, type Lang, type Lesson, type Module } from "./data.ts";
import { EXPAT_MODULES } from "./expat.ts";
import { layoutMethods } from "./layouts.ts";

export const TRACKS = ["azerty-global", "expat"] as const;
export type Track = (typeof TRACKS)[number];
const MODULES: Record<Track, Module[]> = { "azerty-global": LESSONS, expat: EXPAT_MODULES };

/** Disposition des exercices du parcours expatrié quand l'utilisateur n'a pas dit laquelle il apprend. */
export const DEFAULT_EXPAT_LAYOUT: LayoutId = "azerty-windows";

export interface ExerciseRef {
  id: string;
  track: Track;
  module: Module;
  lesson: Lesson;
  exercise: Exercise;
}

export function exerciseId(module: Module, lesson: Lesson, index: number): string {
  return `${module.id}/${lesson.id}/${index + 1}`;
}

function findModule(moduleId: string): { track: Track; module: Module } | undefined {
  for (const track of TRACKS) {
    const module = MODULES[track].find((m) => m.id === moduleId);
    if (module) return { track, module };
  }
  return undefined;
}

export function findExercise(id: string): ExerciseRef | undefined {
  const [moduleId, lessonId, number] = id.split("/");
  const found = findModule(moduleId ?? "");
  const lesson = found?.module.lessons.find((l) => l.id === lessonId);
  const index = Number(number) - 1;
  const exercise = lesson?.exercises[index];
  if (!found || !lesson || !exercise) return undefined;
  return { id: exerciseId(found.module, lesson, index), track: found.track, module: found.module, lesson, exercise };
}

/** Seul le module Typographie exige ’ et les espaces fines ou insécables (QCM du 2026-10-05). */
export const TYPOGRAPHY_MODULE = "typographie-francaise";
export const isLenient = (ref: ExerciseRef) => ref.module.id !== TYPOGRAPHY_MODULE;

export function allExercises(track?: Track): ExerciseRef[] {
  return (track ? [track] : [...TRACKS]).flatMap((t) =>
    MODULES[t].flatMap((module) =>
      module.lessons.flatMap((lesson) => lesson.exercises.map((exercise, index) => ({ id: exerciseId(module, lesson, index), track: t, module, lesson, exercise }))),
    ),
  );
}

/** Disposition sur laquelle se lisent les frappes d'un parcours : AZERTY Global, ou l'AZERTY appris. */
export function trackLayout(track: Track, layout: LayoutId | undefined): LayoutId {
  if (track === "azerty-global") return "azerty-global";
  return layout && layout !== "azerty-global" && layout.startsWith("azerty-") ? layout : DEFAULT_EXPAT_LAYOUT;
}

// Le testeur remplace {ALTGR} par le nom de la touche selon le système ; ici, AltGr dans les deux langues.
const pick = (lang: Lang, fr: string, en: string) => (lang === "fr" ? fr : en).replaceAll("{ALTGR}", "AltGr");

export function listModules(lang: Lang, track: Track = "azerty-global") {
  return MODULES[track].map((m) => ({
    id: m.id,
    title: pick(lang, m.title, m.titleEn),
    description: pick(lang, m.description, m.descriptionEn),
    lessons: m.lessons.map((l) => ({ id: l.id, title: pick(lang, l.title, l.titleEn), characters: l.characters })),
  }));
}

/** Caractères courants du français que certains AZERTY ne tapent pas directement. */
const EXPAT_WATCHED = ["É", "À", "Ç", "œ", "«", "»", "’"];

/**
 * Fin du parcours expatrié : AZERTY Global vient ici, et seulement ici (cadrage, étape 6), et seulement si
 * l'AZERTY appris ne tape pas directement un de ces caractères (décision d'Antoine du 2026-11-05 : jamais de
 * promotion sans besoin). Sinon `undefined` : aucune note.
 */
export function expatNext(lang: Lang, layout?: LayoutId) {
  const on = trackLayout("expat", layout);
  const missing = EXPAT_WATCHED.filter((c) => layoutMethods(on, c).length === 0);
  if (missing.length === 0) return undefined;
  const windows = on === "azerty-windows";
  const list = missing.join(" ");
  const text = windows
    ? lang === "fr"
      ? "Une fois ces bases acquises : sur l'AZERTY de Windows, le plus répandu, les majuscules accentuées (É, À, Ç), œ, les guillemets « » et l'apostrophe ’ ne se tapent qu'avec un code Alt. AZERTY Global les met sur le clavier, avec ses propres leçons."
      : "Once these basics are done: on the Windows AZERTY, the most common one, accented capitals (É, À, Ç), œ, French quotation marks « » and the apostrophe ’ need an Alt code. AZERTY Global puts them on the keyboard, with its own lessons."
    : lang === "fr"
      ? `Une fois ces bases acquises : sur ce clavier, ${list} ne se tapent pas directement. AZERTY Global les met sur le clavier, avec ses propres leçons.`
      : `Once these basics are done: on this keyboard, ${list} cannot be typed directly. AZERTY Global puts them on the keyboard, with its own lessons.`;
  return { track: "azerty-global" as const, text, missing, identity: IDENTITY[lang], download: LINKS.download[lang] };
}

export function lessonDetail(moduleId: string, lessonId: string, lang: Lang, layout?: LayoutId) {
  const found = findModule(moduleId);
  const lesson = found?.module.lessons.find((l) => l.id === lessonId);
  if (!found || !lesson) return undefined;
  const { track, module } = found;
  const on = trackLayout(track, layout);
  return {
    track,
    layout: on,
    layoutName: layoutName(on, lang),
    module: { id: module.id, title: pick(lang, module.title, module.titleEn) },
    id: lesson.id,
    title: pick(lang, lesson.title, lesson.titleEn),
    description: pick(lang, lesson.description, lesson.descriptionEn),
    characters: lesson.characters.map((char) => {
      const sheet = characterSheet(char, on, lang);
      return { char, name: sheet.name, keystrokes: sheet.onYourLayout?.recommended.text ?? null };
    }),
    exercises: lesson.exercises.map((exercise, index) => ({
      id: exerciseId(module, lesson, index),
      instruction: pick(lang, exercise.instruction, exercise.instructionEn),
      content: exercise.content,
    })),
    tester: LINKS.tester[lang],
  };
}
