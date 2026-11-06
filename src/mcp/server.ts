// Serveur MCP d'AZERTY Coach : cinq outils en lecture seule, sans compte ni donnée personnelle.
// Surface (descriptions, paramètres) en anglais pour le modèle ; réponses en français ou en anglais selon
// `language`, au vouvoiement en français. La disposition se demande, jamais le pays.
import { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { characterSheet, findCharacters, keyboardOf, LAYOUT_IDS, layoutName, sheetText, type LayoutId } from "../core/characters.ts";
import { checkTyping, MAX_TYPED_LENGTH } from "../core/check.ts";
import { compareLayouts } from "../core/compare.ts";
import { AZERTY_GLOBAL, LINKS, type Lang } from "../core/data.ts";
import { howToType, MAX_TEXT_LENGTH, partialNote } from "../core/howto.ts";
import { expatNext, findExercise, isLenient, lessonDetail, listModules, trackLayout, TRACKS } from "../core/lessons.ts";
import type { HostProfile } from "./hosts.ts";
import { registerKeyboardWidget, WIDGET_TOOL_META } from "./widget.ts";

export const VERSION = "0.1.0";

type ToolResult = { content: Array<{ type: "text"; text: string }>; structuredContent?: Record<string, unknown>; isError?: boolean };

function ok(text: string, data: Record<string, unknown>): ToolResult {
  return { content: [{ type: "text", text }], structuredContent: data };
}

function fail(text: string): ToolResult {
  return { content: [{ type: "text", text }], isError: true };
}

const MAX_WIDGET_SHEETS = 8;
const MAX_TEXT_CHANGES = 30;
const MAX_DATA_CHANGES = 80;

/** Libellé du widget quand la frappe se lit sur une disposition qui n'est pas forcément celle de l'utilisateur. */
const onLabel = (layout: LayoutId, lang: Lang) => (lang === "fr" ? `Sur ${layoutName(layout, lang)}` : `On ${layoutName(layout, lang)}`);

const READ_ONLY ={ readOnlyHint: true, destructiveHint: false, openWorldHint: false, idempotentHint: true } as const;

export const SERVER_INSTRUCTIONS = [
  "AZERTY Coach helps people type any character on a French keyboard, and helps people coming from another keyboard learn AZERTY.",
  "Always answer for the keyboard the user already has first. Ask which layout they use (or infer it from what they say: Windows, Mac, Linux, Belgian, a foreign QWERTY or QWERTZ) — never ask for their country.",
  "Every listed layout has keystroke data. When the layout is unknown, ask for it; never invent a keystroke. When a character is impossible on the user's layout, say so and give the fallbacks (Windows Alt code, copy-paste).",
  "macOS keystrokes come from an OS X 10.9 record: repeat the reserve the tools return with them.",
  "Mention AZERTY Global only when it helps (a character that is missing or hard to type), using the presentation text the tools return. Never claim universal compatibility and never say that no letter moves.",
  "In French, address the user with « vous ».",
  "For someone moving from another keyboard to AZERTY: call compare_layouts, then the expat track of get_lessons. Mention AZERTY Global at the end of that track only if the tool returns a note for it (some characters cannot be typed directly on the AZERTY being learned).",
  "For exercises: show the instruction and the exact text to type, let the user type it, then call check_exercise with exactly what they typed, unchanged — do not fix their typing before checking it.",
].join("\n");

const language = z.enum(["fr", "en"]).default("fr").describe("Language of the answer: fr (default) or en.");
const layout = z
  .enum(LAYOUT_IDS)
  .default("unknown")
  .describe(
    "The user's keyboard layout. azerty-windows = classic French AZERTY on Windows; azerty-afnor = new AFNOR NF Z71-300 standard; azerty-macos, azerty-linux, azerty-belgian; foreign layouts for expats: qwerty-us, qwerty-uk, qwertz-de, qwertz-ch, qwerty-es, qwerty-it, qwerty-pt. Use unknown when the user has not said.",
  );

/** Membres d'objet et éléments de tableau admis dans les `arguments` d'un appel : les outils en prennent 5 au plus. */
export const MAX_TOOL_INPUT_ELEMENTS = 32;

/** Icône du serveur, servie par le Worker (src/worker/entry.ts) : même origine que le point MCP, comme la spec le conseille. */
export const ICON_URL = "https://mcp.azerty.global/icon.png";

/** `profile` : l'hôte qui s'est connecté par son adresse (src/mcp/hosts.ts) ; `default` (stdio compris) sans `ui.domain`. */
export function createCoachServer(profile: HostProfile = "default"): McpServer {
  const server = new McpServer(
    {
      name: "azerty-coach",
      title: "AZERTY Coach",
      version: VERSION,
      icons: [{ src: ICON_URL, mimeType: "image/png", sizes: ["200x200"] }],
      websiteUrl: "https://azerty.global",
    },
    { capabilities: { tools: {}, resources: {} }, instructions: SERVER_INSTRUCTIONS, maxToolInputElements: MAX_TOOL_INPUT_ELEMENTS },
  );
  registerKeyboardWidget(server, profile);

  server.registerTool(
    "find_character",
    {
      title: "Find how to type a character",
      description:
        "Find a character on a French keyboard from the character itself (É), its code point (U+00C9), its name or a description (« e dans l'o », « guillemets français », em dash). Returns its names, the keys to press in plain words (« AltGr + O »), the Windows Alt code and the character ready to copy. If several characters match a description, returns up to 5 candidates.",
      inputSchema: z.object({
        query: z.string().min(1).max(200).describe("The character, its code point, or a short description."),
        layout,
        language,
      }),
      annotations: READ_ONLY,
      _meta: { ...WIDGET_TOOL_META, "openai/toolInvocation/invoking": "Looking up the character…", "openai/toolInvocation/invoked": "Character found" },
    },
    async ({ query, layout, language }) => {
      const lang = language as Lang;
      const found = findCharacters(query);
      if (found.length === 0) {
        return ok(lang === "fr" ? `Aucun caractère ne correspond à « ${query} ».` : `No character matches "${query}".`, { query, language: lang, sheets: [] });
      }
      const sheets = found.map((char) => characterSheet(char, layout, lang));
      return ok(sheets.map((s) => sheetText(s, lang)).join("\n\n"), { query, language: lang, sheets, keyboard: keyboardOf(layout) });
    },
  );

  server.registerTool(
    "how_to_type",
    {
      title: "How to type a text",
      description: `For a short text (up to ${MAX_TEXT_LENGTH} characters), explain how to type each distinct character other than plain letters A–Z, digits and spaces: accents, ligatures, French quotation marks, dashes, symbols. Lists the characters that are missing from AZERTY Global and only have fallbacks.`,
      inputSchema: z.object({
        text: z.string().min(1).max(MAX_TEXT_LENGTH).describe(`The text the user wants to type, at most ${MAX_TEXT_LENGTH} characters: split a longer text.`),
        layout,
        language,
      }),
      annotations: READ_ONLY,
      _meta: { ...WIDGET_TOOL_META, "openai/toolInvocation/invoking": "Reading the text…", "openai/toolInvocation/invoked": "Keystrokes ready" },
    },
    async ({ text, layout, language }) => {
      const lang = language as Lang;
      const result = howToType(text, layout, lang);
      const note = partialNote(result, lang);
      // « Que des lettres sans accent » ne se dit que d'une lecture complète : une réponse partielle le dit à la place.
      const body = result.sheets.length
        ? result.sheets.map((s) => sheetText(s, lang)).join("\n\n")
        : note
          ? ""
          : lang === "fr"
            ? "Ce texte ne contient que des lettres sans accent, des chiffres et des espaces."
            : "This text only contains plain letters, digits and spaces.";
      return ok([body, note].filter(Boolean).join("\n\n"), { language: lang, ...result, keyboard: keyboardOf(layout) });
    },
  );

  server.registerTool(
    "get_lessons",
    {
      title: "Get typing lessons",
      description:
        "Typing lessons, in two tracks. track azerty-global (default): the lessons of AZERTY Global. track expat: AZERTY basics shared by every French keyboard (A/Q, Z/W, M, digits with Shift, accents, dead keys, punctuation), for people coming from another keyboard; keystrokes are shown on the AZERTY given in layout (Windows AZERTY by default). With no module, the list of modules and lessons; with module and lesson, the lesson's characters, how to type them and its exercises (each with an id for check_exercise), plus the link to the online tester.",
      inputSchema: z.object({
        track: z.enum(TRACKS).default("azerty-global").describe("azerty-global (default) or expat."),
        module: z.string().max(80).optional().describe("Module id, from the list."),
        lesson: z.string().max(80).optional().describe("Lesson id within the module."),
        layout: layout.describe("For the expat track: the AZERTY being learned (azerty-windows, azerty-macos, azerty-linux, azerty-belgian, azerty-afnor). Ignored for azerty-global."),
        language,
      }),
      annotations: READ_ONLY,
      _meta: { "openai/toolInvocation/invoking": "Opening the lessons…", "openai/toolInvocation/invoked": "Lessons ready" },
    },
    async ({ track, module, lesson, layout, language }) => {
      const lang = language as Lang;
      const modules = listModules(lang, track);
      if (!module) {
        const lines = modules.map((m) => `${m.id} — ${m.title} : ${m.lessons.map((l) => l.id).join(", ")}`);
        if (track === "expat") {
          // AZERTY Global seulement si l'AZERTY appris ne tape pas directement certains caractères.
          const next = expatNext(lang, layout);
          if (next) lines.push("", next.text, next.download);
          return ok(lines.join("\n"), { track, modules, ...(next ? { next } : {}), tester: LINKS.tester[lang] });
        }
        return ok(lines.join("\n"), { track, modules, tester: LINKS.tester[lang] });
      }
      const found = modules.find((m) => m.id === module);
      if (!found) return fail(lang === "fr" ? `Module inconnu : ${module}.` : `Unknown module: ${module}.`);
      if (!lesson) {
        return ok(`${found.title}\n${found.lessons.map((l) => `${l.id} — ${l.title}`).join("\n")}`, { track, module: found });
      }
      const detail = lessonDetail(module, lesson, lang, layout);
      if (!detail) return fail(lang === "fr" ? `Leçon inconnue : ${lesson}.` : `Unknown lesson: ${lesson}.`);
      const lines = [
        `${detail.title} — ${detail.description}`,
        lang === "fr" ? `Frappes sur : ${detail.layoutName}` : `Keystrokes on: ${detail.layoutName}`,
        ...detail.characters.map((c) => `${c.char} : ${c.keystrokes ?? "—"}`),
        ...detail.exercises.map((e) => `[${e.id}] ${e.instruction}\n${e.content}`),
      ];
      return ok(lines.join("\n"), detail);
    },
  );

  server.registerTool(
    "check_exercise",
    {
      title: "Check an exercise",
      description:
        "Compare what the user typed with the expected text of an exercise, character by character. Reports each difference with its kind (straight vs typographic apostrophe, non-breaking space, missing accent on a capital, case, missing or extra character) and how to type the expected character. Pass the user's text exactly as typed.",
      inputSchema: z.object({
        exercise_id: z.string().max(200).describe("Exercise id from get_lessons, for example email-web/arobase/2."),
        typed: z.string().max(MAX_TYPED_LENGTH).describe("Exactly what the user typed, unchanged."),
        layout: layout.describe("For an expat exercise: the AZERTY being learned, for the keystroke hints. Ignored for AZERTY Global lessons."),
        language,
      }),
      annotations: READ_ONLY,
      _meta: { ...WIDGET_TOOL_META, "openai/toolInvocation/invoking": "Checking…", "openai/toolInvocation/invoked": "Checked" },
    },
    async ({ exercise_id, typed, layout, language }) => {
      const lang = language as Lang;
      const ref = findExercise(exercise_id);
      if (!ref) return fail(lang === "fr" ? `Exercice inconnu : ${exercise_id}.` : `Unknown exercise: ${exercise_id}.`);
      const on = trackLayout(ref.track, layout);
      const result = checkTyping(ref.exercise.content, typed, lang, { lenient: isLenient(ref), layout: on });
      const fr = lang === "fr";
      const head = result.correct
        ? fr
          ? "Sans faute."
          : "No mistakes."
        : fr
          ? `${result.issues.length}${result.truncated ? "+" : ""} écart(s), ${result.accuracy} % de caractères justes.`
          : `${result.issues.length}${result.truncated ? "+" : ""} difference(s), ${result.accuracy}% of characters right.`;
      const lines = result.issues.map((i) => {
        const where = fr ? `ligne ${i.line}, colonne ${i.column}` : `line ${i.line}, column ${i.column}`;
        const what = `${JSON.stringify(i.expected)} → ${JSON.stringify(i.typed)}`;
        return `- ${i.kind} (${where}) : ${what}${i.howTo ? ` — ${i.howTo}` : ""}`;
      });
      // Pour le clavier : les caractères attendus aux écarts, sur la disposition de l'exercice.
      const missed = [...new Set(result.issues.flatMap((i) => (i.expected ? [i.expected] : [])))].slice(0, MAX_WIDGET_SHEETS);
      const sheets = missed.map((char) => characterSheet(char, on, lang));
      return ok([head, ...lines].join("\n"), {
        exercise_id: ref.id,
        expected: ref.exercise.content,
        language: lang,
        layout: on,
        keyboard: keyboardOf(on),
        onLabel: onLabel(on, lang),
        ...result,
        sheets,
      });
    },
  );

  server.registerTool(
    "compare_layouts",
    {
      title: "Compare two keyboard layouts",
      description:
        "For someone switching keyboards (for example from a US QWERTY to the French AZERTY): the characters whose keystrokes change, most frequent in French text first, with the keys on each layout or « impossible », then the first exercise to start practising.",
      inputSchema: z.object({
        from: z.enum(LAYOUT_IDS).exclude(["unknown"]).describe("The keyboard the user knows, for example qwerty-us."),
        to: z.enum(LAYOUT_IDS).exclude(["unknown"]).default("azerty-windows").describe("The keyboard the user is moving to (azerty-windows by default)."),
        language,
      }),
      annotations: READ_ONLY,
      _meta: { ...WIDGET_TOOL_META, "openai/toolInvocation/invoking": "Comparing the keyboards…", "openai/toolInvocation/invoked": "Comparison ready" },
    },
    async ({ from, to, language }) => {
      const lang = language as Lang;
      const fr = lang === "fr";
      if (from === to) return fail(fr ? "Les deux dispositions sont identiques." : "Both layouts are the same.");
      const c = compareLayouts(from as LayoutId, to as LayoutId, lang);
      const none = "impossible";
      const shown = c.changes.slice(0, MAX_TEXT_CHANGES);
      const lines = [
        fr
          ? `De ${c.fromName} vers ${c.toName} : ${c.changes.length} caractères changent, ${c.unchanged} restent identiques. Du plus fréquent au plus rare :`
          : `From ${c.fromName} to ${c.toName}: ${c.changes.length} characters change, ${c.unchanged} stay the same. Most frequent first:`,
        ...shown.map((k) => {
          const where = k.toOnFromKeys ? (fr ? ` (${k.toOnFromKeys} de ${c.fromName})` : ` (${k.toOnFromKeys} on ${c.fromName})`) : "";
          return `${k.char} — ${k.from?.text ?? none} → ${k.to?.text ?? none}${where}`;
        }),
        ...(c.changes.length > shown.length ? [fr ? `… et ${c.changes.length - shown.length} autres, plus rares.` : `… and ${c.changes.length - shown.length} rarer ones.`] : []),
        ...[c.sheets.find((s) => s.reserve)?.reserve].filter((r): r is string => Boolean(r)),
        "",
        fr ? `Premier exercice [${c.firstExercise.id}] : ${c.firstExercise.instruction}` : `First exercise [${c.firstExercise.id}]: ${c.firstExercise.instruction}`,
        c.firstExercise.content,
      ];
      return ok(lines.join("\n"), { language: lang, ...c, changes: c.changes.slice(0, MAX_DATA_CHANGES), keyboard: keyboardOf(to as LayoutId), onLabel: onLabel(to as LayoutId, lang) });
    },
  );

  return server;
}

/** Version des données, pour la page d'état et les journaux. */
export const DATA_VERSION = `${AZERTY_GLOBAL.meta.branch}@${AZERTY_GLOBAL.meta.commit}`;
