// Solutions de repli quand un caractère manque sur le clavier de l'utilisateur (décision du 2026-10-04) :
// le code Alt sous Windows et le copier-coller ; pas la correction automatique de Word ou de LibreOffice.
// Le code Alt à quatre chiffres (Alt + 0201) suit la page de code Windows-1252 : il ne couvre que ses
// 218 caractères imprimables et demande le pavé numérique.

// Windows-1252, plage 0x80–0x9F : les seuls octets qui diffèrent de Latin-1.
const CP1252_HIGH: Record<number, number> = {
  0x20ac: 0x80, 0x201a: 0x82, 0x0192: 0x83, 0x201e: 0x84, 0x2026: 0x85, 0x2020: 0x86, 0x2021: 0x87,
  0x02c6: 0x88, 0x2030: 0x89, 0x0160: 0x8a, 0x2039: 0x8b, 0x0152: 0x8c, 0x017d: 0x8e, 0x2018: 0x91,
  0x2019: 0x92, 0x201c: 0x93, 0x201d: 0x94, 0x2022: 0x95, 0x2013: 0x96, 0x2014: 0x97, 0x02dc: 0x98,
  0x2122: 0x99, 0x0161: 0x9a, 0x203a: 0x9b, 0x0153: 0x9c, 0x017e: 0x9e, 0x0178: 0x9f,
};

/** « Alt + 0201 » pour É ; `undefined` hors Windows-1252 ou pour un caractère de contrôle. */
export function windowsAltCode(char: string): string | undefined {
  if ([...char].length !== 1) return undefined;
  const cp = char.codePointAt(0) ?? 0;
  let byte: number | undefined;
  if (cp >= 0x20 && cp <= 0x7e) byte = cp;
  else if (cp >= 0xa0 && cp <= 0xff) byte = cp;
  else byte = CP1252_HIGH[cp];
  if (byte === undefined) return undefined;
  return `Alt + ${String(byte).padStart(4, "0")}`;
}

export interface Fallbacks {
  /** Code Alt sous Windows, pavé numérique requis. */
  windowsAltCode?: string;
  /** Le caractère seul, prêt à copier. */
  copy: string;
  codePoint: string;
}

export function fallbacks(char: string): Fallbacks {
  const alt = windowsAltCode(char);
  const codePoint = [...char].map((c) => "U+" + (c.codePointAt(0) ?? 0).toString(16).toUpperCase().padStart(4, "0")).join(" ");
  return { ...(alt ? { windowsAltCode: alt } : {}), copy: char, codePoint };
}
