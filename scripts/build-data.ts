// Produit data/*.json depuis la branche `main` du site (scripts/site-source.ts ; `refonte` jusqu'à la bascule v2).
// Lecture seule : aucune disposition n'est modifiée. `--check` compare sans écrire.
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { branch, commit, root, source } from "./site-source.ts";

const checkOnly = process.argv.includes("--check");

function readJson(path: string): any {
  return JSON.parse(readFileSync(join(source, path), "utf8"));
}

// Codes de touche (KeyboardEvent.code) → positions ISO de data/AZERTY Traditionnel.json.
const ISO_POSITIONS: Record<string, string> = {
  Backquote: "E00", Digit1: "E01", Digit2: "E02", Digit3: "E03", Digit4: "E04", Digit5: "E05", Digit6: "E06",
  Digit7: "E07", Digit8: "E08", Digit9: "E09", Digit0: "E10", Minus: "E11", Equal: "E12",
  KeyQ: "D01", KeyW: "D02", KeyE: "D03", KeyR: "D04", KeyT: "D05", KeyY: "D06", KeyU: "D07", KeyI: "D08",
  KeyO: "D09", KeyP: "D10", BracketLeft: "D11", BracketRight: "D12",
  KeyA: "C01", KeyS: "C02", KeyD: "C03", KeyF: "C04", KeyG: "C05", KeyH: "C06", KeyJ: "C07", KeyK: "C08",
  KeyL: "C09", Semicolon: "C10", Quote: "C11", Backslash: "C12",
  IntlBackslash: "B00", KeyZ: "B01", KeyX: "B02", KeyC: "B03", KeyV: "B04", KeyB: "B05", KeyN: "B06",
  KeyM: "B07", Comma: "B08", Period: "B09", Slash: "B10", Space: "A03",
};

const deadkeys = await import(pathToFileURL(join(source, "tester", "deadkeys.js")).href);
const traditional = readJson("data/AZERTY Traditionnel.json");
const layout = readJson("tester/azerty-global.json");
const index = readJson("tester/character-index.json");
const lessons = readJson("tester/lessons.json");

// Nom d'une touche, règle du site (src/_data/clavier.js, décision du 2026-09-29) : la gravure du clavier
// physique, c'est-à-dire de l'AZERTY traditionnel ; les lettres en capitale ; une touche de chiffre se nomme
// par son chiffre, sauf avec le Verr. Maj. ; une touche dont la base est morte, par son symbole.
const byPosition = new Map<string, any>();
for (const row of traditional.rows) for (const key of row.keys) byPosition.set(key.position, key);
const keyNames: Record<string, { engraving: string; digit: string | null }> = {};
for (const [code, position] of Object.entries(ISO_POSITIONS)) {
  const key = byPosition.get(position);
  if (code === "Space") {
    keyNames[code] = { engraving: "Space", digit: null };
    continue;
  }
  if (!key || typeof key.base !== "string") throw new Error(`Touche absente de l'AZERTY traditionnel : ${code} (${position})`);
  const base: string = key.base;
  const engraving = base.startsWith("dk_") ? (deadkeys.DEAD_KEY_SYMBOLS[base] ?? base) : /^[a-z]$/.test(base) ? base.toUpperCase() : base;
  const digit = /^E(0[1-9]|10)$/.test(position) && /^[0-9]$/.test(key.shift ?? "") ? key.shift : null;
  keyNames[code] = { engraving, digit };
}

const deadKeyInfo: Record<string, { symbol: string; nameFr: string; nameEn: string }> = {};
for (const id of Object.keys(layout.deadkeys)) {
  deadKeyInfo[id] = {
    symbol: deadkeys.DEAD_KEY_SYMBOLS[id] ?? "◌",
    nameFr: deadkeys.DEAD_KEY_NAMES_FR[id] ?? id,
    nameEn: deadkeys.DEAD_KEY_NAMES_EN[id] ?? id,
  };
}

// Les pseudo-caractères « dk:xxx » décrivent l'activation des touches mortes : ils restent dans les
// données (le moteur s'en sert pour situer une touche morte) mais ne sont pas des caractères.
const characters: Record<string, unknown> = {};
for (const [char, entry] of Object.entries<any>(index.characters)) characters[char] = entry;

const RETIRED_MODULES = new Set(["vingt-millions"]); // module « course aux 30 millions », retiré (QCM du 2026-10-04)
const keptModules = lessons.modules.filter((module: any) => !RETIRED_MODULES.has(module.id));

// Surcouche du coach (relecture du 2026-10-05, docs/relecture-lecons-2026-10-05.md) : le site et le testeur
// gardent leur texte. Chaque correction remplace un passage exact ; si la source change, le build échoue
// pour qu'on la relise au lieu de corriger à l'aveugle.
const NBSP = " ";
interface Correction {
  lesson: string;
  /** Champ de la leçon, ou de l'exercice `exercise` (numéro à partir de 1). */
  field: string;
  exercise?: number;
  from: string;
  to: string;
}
const CORRECTIONS: Correction[] = [
  // 1. (retirée le 2026-10-21) « Maj + , » pour le point-virgule : le site écrit « Maj + ; » depuis son commit c0be1a4.
  // 2. Le titre montrait l'apostrophe droite.
  { lesson: "apostrophe-typographique", field: "title", from: "Apostrophe typographique '", to: "Apostrophe typographique ’" },
  { lesson: "apostrophe-typographique", field: "titleEn", from: "Typographic apostrophe '", to: "Typographic apostrophe ’" },
  // 3. Règle du site : une touche se nomme par sa gravure physique ou par son chiffre.
  { lesson: "croisillon", field: "description", from: "Maj + @", to: "Maj + ²" },
  { lesson: "croisillon", field: "descriptionEn", from: "Shift + @", to: "Shift + ²" },
  { lesson: "latin-etendu", field: "description", from: "AltGr + - (touche 6)", to: "AltGr + 6" },
  { lesson: "latin-etendu", field: "descriptionEn", from: "AltGr + - (key 6)", to: "AltGr + 6" },
  { lesson: "latin-etendu", field: "instruction", exercise: 1, from: "{ALTGR} + - (touche 6)", to: "{ALTGR} + 6" },
  { lesson: "latin-etendu", field: "instructionEn", exercise: 1, from: "{ALTGR} + - (key 6)", to: "{ALTGR} + 6" },
  // 5. Usage français : espace insécable entre le montant et le symbole.
  {
    lesson: "monetaires",
    field: "content",
    exercise: 2,
    from: "100£\n1000¥\n5000₩\n500₽\n200₹\n0,5₿\n99¢",
    to: ["100£", "1000¥", "5000₩", "500₽", "200₹", "0,5₿", "99¢"].map((s) => s.replace(/(\d)(\D)$/u, `$1${NBSP}$2`)).join("\n"),
  },
  // 6. La flèche relève d'une touche morte enseignée seulement dans le dernier module.
  { lesson: "latin-etendu", field: "content", exercise: 2, from: "e → ɛ\nn → ŋ\nz → ʒ", to: "e ɛ\nn ŋ\nz ʒ" },
];

for (const c of CORRECTIONS) {
  const lesson = keptModules.flatMap((m: any) => m.lessons).find((l: any) => l.id === c.lesson);
  const target = c.exercise ? lesson?.exercises[c.exercise - 1] : lesson;
  const where = `${c.lesson}${c.exercise ? `/${c.exercise}` : ""} ${c.field}`;
  if (!target || typeof target[c.field] !== "string") throw new Error(`Surcouche : champ introuvable, ${where}`);
  if (!target[c.field].includes(c.from)) throw new Error(`Surcouche : texte d'origine introuvable, ${where} : ${JSON.stringify(c.from)}`);
  target[c.field] = target[c.field].replace(c.from, c.to);
}

// Fréquences des caractères en français (colonne « Formel », data/Frequences-caracteres.csv du site) : elles
// rangent les touches qui changent dans compare_layouts. Les décimales y sont à la française.
const frequencies: Record<string, number> = {};
for (const line of readFileSync(join(source, "data", "Frequences-caracteres.csv"), "utf8").split(/\r?\n/).slice(2)) {
  const m = /^,("(?:[^"]|"")*"|[^,]*),"?([0-9]+(?:,[0-9]+)?)"?/.exec(line);
  if (!m) continue;
  const char = m[1]!.startsWith('"') ? m[1]!.slice(1, -1).replace(/""/g, '"') : m[1]!;
  const value = Number(m[2]!.replace(",", "."));
  if ([...char].length === 1 && value > 0) frequencies[char] = value;
}
if (Object.keys(frequencies).length < 100) throw new Error(`Fréquences : ${Object.keys(frequencies).length} caractères seulement`);

// Les autres dispositions (étape 6 du cadrage, QCM du 2026-10-05) : extraites des DLL de Windows
// (scripts/extract-kbd-dll.py), de xkeyboard-config et du CLDR (scripts/extract-xkb-cldr.py), dans sources/.
// AZERTY AFNOR = pilote KBDFRNA ; macOS = relevé d'OS X 10.9, avec réserve.
interface OtherLayout {
  file: string;
  platform: "windows" | "macos" | "linux";
  nameFr: string;
  nameEn: string;
  reserve?: { fr: string; en: string };
}
const OTHER_LAYOUTS: Record<string, OtherLayout> = {
  "azerty-windows": { file: "windows/kbdfr.json", platform: "windows", nameFr: "AZERTY français (Windows)", nameEn: "French AZERTY (Windows)" },
  "azerty-afnor": { file: "windows/kbdfrna.json", platform: "windows", nameFr: "AZERTY AFNOR (NF Z71-300)", nameEn: "French AZERTY, AFNOR standard (NF Z71-300)" },
  "azerty-macos": {
    file: "macos/fr.json",
    platform: "macos",
    nameFr: "AZERTY Français (macOS)",
    nameEn: "French AZERTY (macOS)",
    reserve: { fr: "relevé d'OS X 10.9", en: "as recorded on OS X 10.9" },
  },
  "azerty-linux": { file: "linux/fr-oss.json", platform: "linux", nameFr: "AZERTY français (Linux, variante oss)", nameEn: "French AZERTY (Linux, oss variant)" },
  "azerty-belgian": { file: "windows/kbdbe.json", platform: "windows", nameFr: "AZERTY belge (Windows)", nameEn: "Belgian AZERTY (Windows)" },
  "qwerty-us": { file: "windows/kbdus.json", platform: "windows", nameFr: "QWERTY américain (Windows)", nameEn: "US QWERTY (Windows)" },
  "qwerty-uk": { file: "windows/kbduk.json", platform: "windows", nameFr: "QWERTY britannique (Windows)", nameEn: "UK QWERTY (Windows)" },
  "qwertz-de": { file: "windows/kbdgr.json", platform: "windows", nameFr: "QWERTZ allemand (Windows)", nameEn: "German QWERTZ (Windows)" },
  "qwertz-ch": { file: "windows/kbdsg.json", platform: "windows", nameFr: "QWERTZ suisse (Windows)", nameEn: "Swiss QWERTZ (Windows)" },
  "qwerty-es": { file: "windows/kbdsp.json", platform: "windows", nameFr: "QWERTY espagnol (Windows)", nameEn: "Spanish QWERTY (Windows)" },
  "qwerty-it": { file: "windows/kbdit.json", platform: "windows", nameFr: "QWERTY italien (Windows)", nameEn: "Italian QWERTY (Windows)" },
  "qwerty-pt": { file: "windows/kbdpo.json", platform: "windows", nameFr: "QWERTY portugais (Windows)", nameEn: "Portuguese QWERTY (Windows)" },
};
// Touches mortes absentes d'AZERTY Global : nom donné ici.
const EXTRA_DEAD_KEYS: Record<string, { symbol: string; nameFr: string; nameEn: string }> = {
  dk_macron_below: { symbol: "ˍ", nameFr: "Macron souscrit", nameEn: "Macron below" },
};
const DIGIT_CODES = new Set(["Digit1", "Digit2", "Digit3", "Digit4", "Digit5", "Digit6", "Digit7", "Digit8", "Digit9", "Digit0"]);

const layouts: Record<string, unknown> = {};
for (const [id, spec] of Object.entries(OTHER_LAYOUTS)) {
  const raw = JSON.parse(readFileSync(join(root, "sources", spec.file), "utf8"));
  const info: Record<string, { symbol: string; nameFr: string; nameEn: string }> = {};
  for (const dk of Object.keys(raw.deadkeys)) {
    const known = deadKeyInfo[dk] ?? EXTRA_DEAD_KEYS[dk];
    if (!known) throw new Error(`${id} : touche morte sans nom, ${dk}`);
    info[dk] = known;
  }
  // Nom d'une touche : sa gravure sur ce clavier, c'est-à-dire la couche de base, en capitale pour une lettre
  // dont Maj donne la capitale (é, ù et ß restent en minuscule) ; le symbole pour une touche morte. Une touche
  // de la rangée des chiffres se nomme aussi par son chiffre.
  const names: Record<string, { engraving: string; digit: string | null }> = {};
  for (const [code, values] of Object.entries<Array<string | null>>(raw.keymap)) {
    if (code === "Space") {
      names[code] = { engraving: "Space", digit: null };
      continue;
    }
    const base = values[0];
    if (typeof base !== "string") throw new Error(`${id} : touche ${code} sans couche de base`);
    const engraving = base.startsWith("dk_") ? info[base]!.symbol : /^\p{Ll}$/u.test(base) && values[1] === base.toUpperCase() ? values[1] : base;
    const digit = DIGIT_CODES.has(code) ? ([base, values[1]].find((v) => typeof v === "string" && /^[0-9]$/.test(v)) ?? null) : null;
    names[code] = { engraving, digit };
  }
  // La provenance seulement : les tables brutes (codes virtuels, attributs du Verr. Maj.) restent dans sources/.
  const { virtualKeys, capsAttributes, capsSummary, vkToWcharTables, modifiers, layers, ...provenance } = raw.meta;
  layouts[id] = {
    meta: { source: `sources/${spec.file}`, ...provenance },
    name: { fr: spec.nameFr, en: spec.nameEn },
    platform: spec.platform,
    ...(spec.reserve ? { reserve: spec.reserve } : {}),
    keymap: raw.keymap,
    deadkeys: raw.deadkeys,
    deadKeyInfo: info,
    keyNames: names,
  };
}

const meta = { branch, commit, indexGenerated: index.generated, lessonsGenerated: lessons.generated };
const outputs: Record<string, unknown> = {
  "layouts.json": { frequencies, layouts },
  "azerty-global.json": {
    meta,
    name: layout.name,
    version: layout.version,
    keymap: layout.keymap,
    deadkeys: layout.deadkeys,
    deadKeyInfo,
    keyNames,
    characters,
  },
  "lessons.json": { meta: { ...meta, corrections: CORRECTIONS.length }, version: lessons.version, modules: keptModules },
};

let stale = 0;
for (const [name, value] of Object.entries(outputs)) {
  const path = join(root, "data", name);
  const text = JSON.stringify(value) + "\n";
  let previous = "";
  try {
    previous = readFileSync(path, "utf8");
  } catch {}
  // Le commit source change à chaque commit du site : la comparaison l'ignore.
  const comparable = (t: string) => t.replace(/"commit":"[0-9a-f]+"/, "");
  if (comparable(previous) === comparable(text)) continue;
  stale += 1;
  if (checkOnly) console.error(`Périmé : data/${name}`);
  else writeFileSync(path, text);
}
const chars = Object.keys(characters).filter((c) => !c.startsWith("dk:")).length;
const exercises = keptModules.reduce((n: number, m: any) => n + m.lessons.reduce((k: number, l: any) => k + l.exercises.length, 0), 0);
console.log(`${branch}@${commit} : ${chars} caractères, ${keptModules.length} modules, ${exercises} exercices${checkOnly ? (stale ? `, ${stale} fichier(s) périmé(s)` : ", à jour") : ""}.`);
if (checkOnly && stale) process.exit(1);
