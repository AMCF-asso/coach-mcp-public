// Moteur : données, frappes en clair, recherche, repli, correction. Aucune requête réseau.
import assert from "node:assert/strict";
import { test } from "node:test";
import { characterSheet, findCharacters, sheetText } from "../src/core/characters.ts";
import { checkTyping } from "../src/core/check.ts";
import { compareLayouts } from "../src/core/compare.ts";
import { AZERTY_GLOBAL, LESSONS } from "../src/core/data.ts";
import { windowsAltCode } from "../src/core/fallback.ts";
import { howToType } from "../src/core/howto.ts";
import { describeMethod } from "../src/core/keys.ts";
import { allExercises, findExercise, isLenient, lessonDetail, trackLayout } from "../src/core/lessons.ts";

const sheet = (char: string, lang: "fr" | "en" = "fr") => characterSheet(char, "azerty-global", lang);
const how = (char: string, lang: "fr" | "en" = "fr") => sheet(char, lang).onYourLayout?.recommended.text;

// 69 exercices depuis main@8d13b24 : la leçon caps-a-grave du site n'a plus que deux exercices (2026-10-21).
test("données : 1 100 caractères, 7 modules, 69 exercices, sans le module « 30 millions »", () => {
  const real = Object.keys(AZERTY_GLOBAL.characters).filter((c) => !c.startsWith("dk:"));
  assert.equal(real.length, 1100);
  assert.equal(LESSONS.length, 7);
  assert.equal(allExercises("azerty-global").length, 69);
  assert.equal(allExercises("expat").length, 9);
  assert.ok(!LESSONS.some((m) => m.id === "vingt-millions"));
  assert.equal(AZERTY_GLOBAL.meta.branch, "main");
});

test("chaque méthode de l'index se décrit, chaque caractère a une méthode recommandée", () => {
  let methods = 0;
  for (const [char, entry] of Object.entries(AZERTY_GLOBAL.characters)) {
    assert.equal(entry.methods.filter((m) => m.recommended).length, 1, char);
    for (const method of entry.methods) {
      for (const lang of ["fr", "en"] as const) {
        const k = describeMethod(method, lang);
        assert.ok(k.text && !/Key[A-Z]|Digit|Bracket|Quote|Semicolon|Backquote|undefined/.test(k.text), `${char} → ${k.text}`);
      }
      methods += 1;
    }
  }
  assert.equal(methods, 2666);
});

test("frappes en clair : règles de nommage du site", () => {
  assert.equal(how("œ"), "AltGr + O");
  assert.equal(how("€"), "AltGr + E");
  assert.equal(how("É"), "Verr. Maj. + é"); // le Verr. Maj. garde la lettre
  assert.equal(how("ŵ"), "touche ^, puis touche W");
  assert.equal(how("@"), "touche ²");
  assert.equal(how("«"), "AltGr + W");
  assert.equal(how("ẞ"), "AltGr + Maj + B");
  assert.equal(how("’"), "AltGr + 4"); // une touche de chiffre se nomme par son chiffre
  assert.equal(how("ă"), "touche ^, puis touche R"); // table du circonflexe d'AZERTY Global
  assert.deepEqual(sheet("É").onYourLayout?.others.map((k) => k.text), ["touche ^, puis touche é", "touche ù, puis Maj + E"]);
  assert.equal(how("‑"), "AltGr + Maj + 6");
  assert.equal(how("œ", "en"), "AltGr + O");
  assert.equal(how("É", "en"), "Caps Lock + é");
  assert.equal(how("@", "en"), "² key");
});

test("recherche : caractère, point de code, alias et noms, accents ou non", () => {
  assert.deepEqual(findCharacters("œ"), ["œ"]);
  assert.deepEqual(findCharacters("U+00C9"), ["É"]);
  assert.deepEqual(findCharacters("u+0153"), ["œ"]);
  assert.equal(findCharacters("e dans l'o")[0], "œ");
  assert.equal(findCharacters("o e collés")[0], "œ");
  assert.equal(findCharacters("é majuscule")[0], "É");
  assert.equal(findCharacters("euro")[0], "€");
  assert.ok(findCharacters("guillemet francais").some((c) => c === "«"));
  assert.ok(findCharacters("em dash").includes("—"));
  assert.ok(findCharacters("tiret cadratin").includes("—"));
  assert.deepEqual(findCharacters("zzzz qqqq"), []);
});

test("caractère absent d'AZERTY Global : repli seulement", () => {
  const s = sheet("😀");
  assert.equal(s.onAzertyGlobal, false);
  assert.equal(s.onYourLayout, undefined);
  assert.equal(s.fallbacks.copy, "😀");
  assert.equal(s.fallbacks.windowsAltCode, undefined);
});

test("caractère impossible sur la disposition : repli, puis AZERTY Global avec son lien", () => {
  const s = characterSheet("É", "azerty-windows", "fr");
  assert.equal(s.layoutCovered, true);
  assert.equal(s.impossibleOnYourLayout, true);
  assert.equal(s.onYourLayout, undefined);
  assert.equal(s.withAzertyGlobal?.recommended.text, "Verr. Maj. + é");
  assert.equal(s.fallbacks.windowsAltCode, "Alt + 0201");
  assert.match(s.suggestion?.download ?? "", /^https:\/\/azerty\.global\/download$/);
  assert.doesNotMatch(s.suggestion?.text ?? "", /aucune lettre ne bouge/i);
  // Sur AZERTY Global, pas de conseil : l'utilisateur l'a déjà ; ni quand la disposition le tape.
  assert.equal(sheet("É").suggestion, undefined);
  assert.equal(characterSheet("É", "azerty-afnor", "fr").suggestion, undefined);
  // Disposition inconnue : aucune frappe inventée.
  const unknown = characterSheet("É", "unknown", "fr");
  assert.equal(unknown.layoutCovered, false);
  assert.equal(unknown.onYourLayout, undefined);
  // Et rien d'AZERTY Global là : é se tape sur tout AZERTY, le conseil ne vient que d'un caractère impossible.
  assert.equal(unknown.withAzertyGlobal, undefined);
  assert.equal(unknown.suggestion, undefined);
  assert.doesNotMatch(sheetText(unknown, "fr"), /AZERTY Global|azerty\.global/);
});

test("recherche : le pluriel de l'exemple de la description trouve les guillemets", () => {
  assert.deepEqual(findCharacters("guillemets français"), ["«", "»"]);
  assert.deepEqual(findCharacters("guillemet français"), ["«", "»"]);
});

test("frappes des autres dispositions (DLL Windows, xkb, CLDR), sondées le 2026-10-05", () => {
  const on = (layout: Parameters<typeof characterSheet>[1], char: string) => characterSheet(char, layout, "fr").onYourLayout?.recommended.text;
  assert.equal(on("qwerty-us", "@"), "Maj + 2");
  assert.equal(on("qwerty-uk", "@"), "Maj + '");
  assert.equal(on("qwertz-de", "@"), "AltGr + Q");
  assert.equal(on("qwertz-de", "é"), "touche ´, puis touche E");
  assert.equal(on("qwertz-ch", "é"), "Maj + ö");
  assert.equal(on("azerty-windows", "@"), "AltGr + 0");
  assert.equal(on("azerty-belgian", "@"), "AltGr + 2");
  assert.equal(on("azerty-afnor", "É"), "AltGr + Maj + 2");
  assert.equal(on("azerty-afnor", "œ"), "AltGr + O");
  assert.equal(on("azerty-linux", "É"), "AltGr + Maj + 2");
  assert.equal(on("azerty-linux", "œ"), "AltGr + O");
  assert.equal(on("azerty-macos", "«"), "Option + 7");
  assert.equal(on("azerty-macos", "É"), "Verr. Maj. + é");
  assert.equal(characterSheet("@", "azerty-macos", "fr").reserve, "relevé d'OS X 10.9");
  assert.equal(on("azerty-windows", "œ"), undefined);
  assert.equal(on("qwerty-us", "é"), undefined);
});

test("parcours expatrié : chaque exercice se tape sur les cinq AZERTY (espaces insécables tolérées)", () => {
  const azerty = ["azerty-windows", "azerty-afnor", "azerty-macos", "azerty-linux", "azerty-belgian"] as const;
  for (const ref of allExercises("expat")) {
    assert.ok(isLenient(ref), ref.id);
    const chars = new Set([...ref.exercise.content].filter((c) => !/[\n  ]/u.test(c)));
    for (const layout of azerty)
      for (const char of chars) assert.ok(characterSheet(char, layout, "fr").onYourLayout, `${ref.id} ${layout} ${char}`);
  }
  assert.equal(trackLayout("expat", undefined), "azerty-windows");
  assert.equal(trackLayout("expat", "qwerty-us"), "azerty-windows");
  assert.equal(trackLayout("expat", "azerty-macos"), "azerty-macos");
  assert.equal(trackLayout("azerty-global", "azerty-macos"), "azerty-global");
  assert.equal(lessonDetail("bases-azerty", "ponctuation", "fr", "azerty-macos")?.layoutName, "AZERTY Français (macOS)");
});

test("compare_layouts : changements du plus fréquent au plus rare, touche nommée sur le clavier d'origine", () => {
  const c = compareLayouts("qwerty-us", "azerty-windows", "fr");
  assert.equal(c.changes[0]?.char, "a");
  assert.equal(c.changes[0]?.toOnFromKeys, "touche Q");
  const e = c.changes.find((k) => k.char === "é");
  assert.equal(e?.from, null);
  assert.equal(e?.to?.text, "touche é");
  assert.ok(c.changes.every((k, i) => i === 0 || c.changes[i - 1]!.frequency >= k.frequency));
  assert.ok(!c.changes.some((k) => /^\p{M}$/u.test(k.char)));
  assert.equal(c.firstExercise.id, "bases-azerty/lettres/1");
  assert.ok(c.sheets.length > 0 && c.sheets.length <= 8);
  // Vers AZERTY Global : ses propres leçons.
  assert.equal(compareLayouts("azerty-windows", "azerty-global", "fr").firstExercise.track, "azerty-global");
  // Sur Mac, le modificateur reste « Option ».
  const mac = compareLayouts("qwertz-de", "azerty-macos", "fr").changes.find((k) => k.char === "’");
  assert.equal(mac?.to?.text, "Option + Maj + 4");
  assert.equal(mac?.toOnFromKeys, undefined);
});

test("codes Alt : Windows-1252 seulement", () => {
  assert.equal(windowsAltCode("É"), "Alt + 0201");
  assert.equal(windowsAltCode("œ"), "Alt + 0156");
  assert.equal(windowsAltCode("€"), "Alt + 0128");
  assert.equal(windowsAltCode("—"), "Alt + 0151");
  assert.equal(windowsAltCode("@"), "Alt + 0064");
  assert.equal(windowsAltCode("ŵ"), undefined);
  assert.equal(windowsAltCode(" "), undefined);
});

test("how_to_type : caractères distincts hors lettres simples, chiffres et blancs", () => {
  const r = howToType("Où êtes-vous ? À bientôt 😀", "azerty-global", "fr");
  assert.deepEqual(r.sheets.map((s) => s.char), ["ù", "ê", "-", "?", "À", "ô", "😀"]);
  assert.deepEqual(r.notOnAzertyGlobal, ["😀"]);
  assert.equal(r.truncated, false);
});

test("check_exercise : écarts nommés et positions", () => {
  assert.deepEqual(checkTyping("jean@mail.fr", "jean@mail.fr\r\n", "fr").issues, []);
  const apostrophe = checkTyping("l’été", "l'été", "fr");
  assert.equal(apostrophe.issues[0]?.kind, "apostrophe");
  assert.equal(apostrophe.issues[0]?.howTo, "AltGr + 4");
  assert.equal(checkTyping("Écoutez", "Ecoutez", "fr").issues[0]?.kind, "missing_accent");
  assert.equal(checkTyping("Écoutez", "écoutez", "fr").issues[0]?.kind, "case");
  assert.equal(checkTyping("« oui »", "« oui »", "fr").issues[0]?.kind, "space");
  const lines = checkTyping("a@b.fr\nx@y.eu", "a@b.fr\nx@yeu", "fr");
  assert.deepEqual(lines.issues.map((i) => [i.kind, i.line, i.column, i.expected]), [["missing", 2, 4, "."]]);
  assert.equal(lines.accuracy, 92);
  const extra = checkTyping("abc", "abxc", "fr");
  assert.deepEqual(extra.issues.map((i) => i.kind), ["extra"]);
});

test("check_exercise : hors du module Typographie, ’ et les espaces fines valent ' et l'espace simple", () => {
  const lenient = { lenient: true };
  assert.deepEqual(checkTyping("C'est l'été !", "C’est l’été !", "fr", lenient).issues, []);
  assert.deepEqual(checkTyping("l’école", "l'école", "fr", lenient).issues, []);
  // La tolérance ne couvre ni les guillemets ni les accents.
  assert.equal(checkTyping("\"oui\"", "« oui »", "fr", lenient).correct, false);
  assert.equal(checkTyping("École", "Ecole", "fr", lenient).issues[0]?.kind, "missing_accent");
  // Typographie : l'écart reste signalé.
  const ref = findExercise("typographie-francaise/apostrophe-typographique/2");
  assert.ok(ref && !isLenient(ref));
  assert.equal(checkTyping(ref.exercise.content, ref.exercise.content.replaceAll("’", "'"), "fr").issues[0]?.kind, "apostrophe");
  assert.ok(isLenient(findExercise("email-web/arobase/1")!));
});

test("surcouche des leçons : écarts du 2026-10-05 corrigés", () => {
  const text = (id: string, lang: "fr" | "en" = "fr") => {
    const [m, l] = id.split("/");
    return JSON.stringify(lessonDetail(m!, l!, lang));
  };
  // Le point-virgule : corrigé à la source (site, commit c0be1a4), la surcouche n'y touche plus.
  assert.match(text("email-web/point-virgule"), /"description":"Le point-virgule est maintenant sur Maj \+ ;"/);
  assert.doesNotMatch(text("email-web/point-virgule", "en"), /Shift \+ ,/);
  assert.match(text("typographie-francaise/apostrophe-typographique"), /"title":"Apostrophe typographique ’"/);
  assert.match(text("email-web/croisillon"), /Maj \+ ²/);
  assert.doesNotMatch(text("langues-etrangeres/latin-etendu") + text("langues-etrangeres/latin-etendu", "en"), /\(touche 6\)|\(key 6\)|→/);
  assert.equal(findExercise("symboles-specialises/monetaires/2")?.exercise.content.split("\n")[0], "100 £");
  // Les descriptions suivent les frappes calculées.
  assert.equal(how(";"), "Maj + ;");
  assert.equal(how("#"), "Maj + ²");
});

test("exercices : identifiants stables", () => {
  const ref = findExercise("email-web/arobase/2");
  assert.equal(ref?.exercise.content, "a@b.fr\nx@y.eu\nok@go.io");
  assert.equal(findExercise("email-web/arobase/9"), undefined);
  assert.equal(findExercise("vingt-millions/course-20-millions/1"), undefined);
});

test("leçons : le marqueur {ALTGR} du testeur ne sort jamais", () => {
  for (const module of LESSONS)
    for (const lesson of module.lessons)
      for (const lang of ["fr", "en"] as const) {
        const detail = lessonDetail(module.id, lesson.id, lang);
        assert.doesNotMatch(JSON.stringify(detail), /\{ALTGR\}/, `${lesson.id} ${lang}`);
      }
});
