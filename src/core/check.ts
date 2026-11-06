// Correction d'un exercice, caractère par caractère. Les écarts que le cadrage nomme sont reconnus :
// apostrophe droite ou typographique, espace insécable, majuscule accentuée.
import { characterSheet, type LayoutId } from "./characters.ts";
import type { Lang } from "./data.ts";

export type IssueKind =
  | "apostrophe"
  | "quotation_mark"
  | "space"
  | "missing_accent"
  | "wrong_accent"
  | "case"
  | "missing"
  | "extra"
  | "wrong";

export interface Issue {
  kind: IssueKind;
  /** Position dans le texte attendu, à partir de 1 (ligne, colonne). */
  line: number;
  column: number;
  expected: string | null;
  typed: string | null;
  /** Comment taper le caractère attendu, sur la disposition de l'exercice. */
  howTo?: string;
}

export interface CheckResult {
  correct: boolean;
  /** Part des caractères attendus tapés juste, en pourcentage entier. */
  accuracy: number;
  issues: Issue[];
  truncated: boolean;
}

const APOSTROPHES = new Set(["'", "’", "‘", "ʼ", "`", "´"]);
const QUOTES = new Set(['"', "«", "»", "“", "”", "„", "‹", "›"]);
const SPACES = new Set([" ", " ", " ", " ", " "]);
const MAX_ISSUES = 20;

function normalize(text: string): string[] {
  const lines = text.replace(/\r\n?/g, "\n").normalize("NFC").split("\n").map((l) => l.replace(/[ \t]+$/u, ""));
  return [...lines.join("\n").trim()];
}

function stripMarks(c: string): string {
  return c.normalize("NFD").replace(/\p{M}/gu, "");
}

function classify(expected: string, typed: string): IssueKind {
  if (APOSTROPHES.has(expected) && APOSTROPHES.has(typed)) return "apostrophe";
  if (QUOTES.has(expected) && QUOTES.has(typed)) return "quotation_mark";
  if (SPACES.has(expected) && SPACES.has(typed)) return "space";
  if (expected.toLowerCase() === typed.toLowerCase()) return "case";
  const e = stripMarks(expected);
  const t = stripMarks(typed);
  if (e.toLowerCase() === t.toLowerCase()) return t === typed ? "missing_accent" : "wrong_accent";
  return "wrong";
}

type Op = { op: "same" | "sub" | "del" | "ins"; e?: string; t?: string; at: number };

// Hors du module Typographie, l'apostrophe droite ou typographique et l'espace simple, fine ou insécable
// se valent (QCM du 2026-10-05) : ces exercices n'enseignent pas la typographie.
const LENIENT_APOSTROPHES = new Set(["'", "’"]);
function fold(c: string): string {
  if (LENIENT_APOSTROPHES.has(c)) return "'";
  if (SPACES.has(c)) return " ";
  return c;
}

/** Alignement par plus longue sous-suite commune ; une suppression suivie d'une insertion devient une substitution. */
function align(expected: string[], typed: string[], lenient: boolean): Op[] {
  const n = expected.length;
  const m = typed.length;
  const ek = lenient ? expected.map(fold) : expected;
  const tk = lenient ? typed.map(fold) : typed;
  const table = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i -= 1) {
    for (let j = m - 1; j >= 0; j -= 1) {
      table[i]![j] = ek[i] === tk[j] ? table[i + 1]![j + 1]! + 1 : Math.max(table[i + 1]![j]!, table[i]![j + 1]!);
    }
  }
  const raw: Op[] = [];
  let i = 0;
  let j = 0;
  while (i < n || j < m) {
    if (i < n && j < m && ek[i] === tk[j]) {
      raw.push({ op: "same", e: expected[i], t: typed[j], at: i });
      i += 1;
      j += 1;
    } else if (j < m && (i >= n || table[i]![j + 1]! >= table[i + 1]![j]!)) {
      raw.push({ op: "ins", t: typed[j], at: i });
      j += 1;
    } else {
      raw.push({ op: "del", e: expected[i], at: i });
      i += 1;
    }
  }
  const ops: Op[] = [];
  for (let k = 0; k < raw.length; k += 1) {
    const a = raw[k]!;
    const b = raw[k + 1];
    if (b && ((a.op === "del" && b.op === "ins") || (a.op === "ins" && b.op === "del"))) {
      const del = a.op === "del" ? a : b;
      const ins = a.op === "ins" ? a : b;
      ops.push({ op: "sub", e: del.e, t: ins.t, at: del.at });
      k += 1;
    } else ops.push(a);
  }
  return ops;
}

function position(expected: string[], index: number): { line: number; column: number } {
  let line = 1;
  let column = 1;
  for (let k = 0; k < index && k < expected.length; k += 1) {
    if (expected[k] === "\n") {
      line += 1;
      column = 1;
    } else column += 1;
  }
  return { line, column };
}

export const MAX_TYPED_LENGTH = 4000;

export interface CheckOptions {
  /** Apostrophes et espaces équivalentes (exercices hors du module Typographie). */
  lenient?: boolean;
  /** Disposition des indications de frappe (AZERTY Global par défaut). */
  layout?: LayoutId;
}

export function checkTyping(expectedText: string, typedText: string, lang: Lang, options: CheckOptions = {}): CheckResult {
  const expected = normalize(expectedText);
  const typed = normalize(typedText.slice(0, MAX_TYPED_LENGTH));
  const issues: Issue[] = [];
  let same = 0;
  for (const op of align(expected, typed, options.lenient ?? false)) {
    if (op.op === "same") {
      same += 1;
      continue;
    }
    const kind: IssueKind = op.op === "del" ? "missing" : op.op === "ins" ? "extra" : classify(op.e!, op.t!);
    const issue: Issue = { kind, ...position(expected, op.at), expected: op.e ?? null, typed: op.t ?? null };
    if (op.e && op.e !== "\n") {
      const howTo = characterSheet(op.e, options.layout ?? "azerty-global", lang).onYourLayout?.recommended.text;
      if (howTo) issue.howTo = howTo;
    }
    issues.push(issue);
  }
  const total = expected.length;
  return {
    correct: issues.length === 0,
    accuracy: total === 0 ? 100 : Math.round((same / total) * 100),
    issues: issues.slice(0, MAX_ISSUES),
    truncated: issues.length > MAX_ISSUES,
  };
}
