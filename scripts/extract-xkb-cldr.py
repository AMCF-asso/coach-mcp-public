"""Linux (xkeyboard-config, fr variante oss) et macOS (CLDR « French », OS X 10.9) au format du coach.

Sortie : sources/linux/fr-oss.json et sources/macos/fr.json, au même format que sources/windows/*.json
(meta, keymap à 8 couches, deadkeys, deadKeyInfo). Les fichiers d'origine sont copiés dans sources/linux/
et sources/macos/ depuis operations/2026-09-25-diagnostic-2026.1/sources ; leur SHA-256 est contrôlé.

  python scripts/extract-xkb-cldr.py           écrit les deux JSON
  python scripts/extract-xkb-cldr.py --check   compare sans écrire (code 1 si périmé)

Linux, Verr. Maj. : modèle de libxkbcommon (types automatiques de xkbcomp et transformation de casse quand
le Verr. Maj. n'est pas consommé). Déduit des règles, pas relevé sur une machine.
macOS : relevé d'OS X 10.9 (CLDR release-43). CLDR range E00 et B00 selon les codes Apple 50 et 10, que
les claviers ISO d'Apple inversent physiquement ; on corrige l'inversion (diagnostic.py:258-272).
"""
import hashlib
import json
import re
import sys
import unicodedata as ud
import xml.etree.ElementTree as ET
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
LINUX = ROOT / "sources" / "linux"
MACOS = ROOT / "sources" / "macos"
LAYERS = ["Base", "Shift", "Caps", "Caps+Shift", "AltGr", "Shift+AltGr", "Caps+AltGr", "Caps+Shift+AltGr"]

LINUX_FILES = {
    "symbols-fr": ("xkeyboard-config 2.48, symbols/fr", "cc93334b7dd531de98484b118fc16281c36305c306275e430848dda78da23999"),
    "symbols-nbsp": ("xkeyboard-config 2.48, symbols/nbsp", "fcdebe89f88e385ca2ba178274cd3b04c0e7066afa10395e8c30671997baa441"),
    "Compose.pre": ("libX11 1.8.13, nls/en_US.UTF-8/Compose.pre, utilisé par fr_FR.UTF-8", "cba1921a6b927218a9d4c2888454ec4970ce976842ba7a6a1dc018220bf55ac0"),
    "keysymdef.h": ("xorgproto 2025.1, include/X11/keysymdef.h", "ebadfb6a3efef8fee1461fd905b3293af297ccfd8a080564f0b7e72a0e8816da"),
}
MACOS_FILE = ("fr-t-k0-osx.xml", "CLDR release-43, keyboards/osx, platform 10.9", "8a2808c4e2f6a1035ad87b83ea929d9be3f2a0b30785fba31380fc709bdfb622")

# Positions ISO → KeyboardEvent.code (scripts/build-data.ts, ISO_POSITIONS).
ISO_TO_CODE = {
    "E00": "Backquote", "E01": "Digit1", "E02": "Digit2", "E03": "Digit3", "E04": "Digit4", "E05": "Digit5",
    "E06": "Digit6", "E07": "Digit7", "E08": "Digit8", "E09": "Digit9", "E10": "Digit0", "E11": "Minus", "E12": "Equal",
    "D01": "KeyQ", "D02": "KeyW", "D03": "KeyE", "D04": "KeyR", "D05": "KeyT", "D06": "KeyY", "D07": "KeyU",
    "D08": "KeyI", "D09": "KeyO", "D10": "KeyP", "D11": "BracketLeft", "D12": "BracketRight", "D13": "Backslash",
    "C01": "KeyA", "C02": "KeyS", "C03": "KeyD", "C04": "KeyF", "C05": "KeyG", "C06": "KeyH", "C07": "KeyJ",
    "C08": "KeyK", "C09": "KeyL", "C10": "Semicolon", "C11": "Quote", "C12": "Backslash",
    "B00": "IntlBackslash", "B01": "KeyZ", "B02": "KeyX", "B03": "KeyC", "B04": "KeyV", "B05": "KeyB",
    "B06": "KeyN", "B07": "KeyM", "B08": "Comma", "B09": "Period", "B10": "Slash", "A03": "Space",
}
XKB_TO_ISO = {"TLDE": "E00", "BKSL": "D13", "LSGT": "B00", "SPCE": "A03"}
XKB_TO_ISO.update({f"AE{i:02}": f"E{i:02}" for i in range(1, 13)})
XKB_TO_ISO.update({f"AD{i:02}": f"D{i:02}" for i in range(1, 13)})
XKB_TO_ISO.update({f"AC{i:02}": f"C{i:02}" for i in range(1, 12)})
XKB_TO_ISO.update({f"AB{i:02}": f"B{i:02}" for i in range(1, 11)})

# Noms des touches mortes : identifiants du coach (ceux d'AZERTY Global et des DLL Windows).
XKB_DEAD = {
    "dead_grave": "dk_grave", "dead_acute": "dk_acute", "dead_circumflex": "dk_circumflex", "dead_tilde": "dk_tilde",
    "dead_diaeresis": "dk_diaeresis", "dead_abovering": "dk_ring_above", "dead_cedilla": "dk_cedilla",
    "dead_caron": "dk_caron", "dead_ogonek": "dk_ogonek", "dead_breve": "dk_breve", "dead_macron": "dk_macron",
}
MAC_DEAD = {"`": "dk_grave", "´": "dk_acute", "^": "dk_circumflex", "¨": "dk_diaeresis", "~": "dk_tilde"}


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def check_sha(path: Path, expected: str) -> None:
    got = sha256(path)
    if got != expected:
        sys.exit(f"SHA-256 inattendu pour {path.name} : {got}")


def dead_info(ids_symbols: dict) -> dict:
    return {dk: {"symbol": s, "codePoint": f"U+{ord(s):04X}", "unicodeName": ud.name(s, "")} for dk, s in ids_symbols.items()}


def upper1(ch):
    """Majuscule d'un caractère latin, quand elle tient en un caractère ; sinon le caractère lui-même."""
    if not isinstance(ch, str) or ch.startswith("dk_") or len(ch) != 1:
        return ch
    up = ch.upper()
    return up if len(up) == 1 and ud.name(ch, "").startswith("LATIN") else ch


# --- Linux -----------------------------------------------------------------------------------------------

def keysym_table() -> dict:
    table = {}
    for line in (LINUX / "keysymdef.h").read_text(encoding="utf-8").splitlines():
        m = re.match(r"#define XK_(\w+)\s+0x([0-9a-fA-F]+)(.*)", line)
        if not m:
            continue
        name, value, rest = m.group(1), int(m.group(2), 16), m.group(3)
        u = re.search(r"U\+([0-9A-Fa-f]{4,6})", rest)
        if u:
            table[name] = chr(int(u.group(1), 16))
        elif 0x20 <= value <= 0xFF:
            table[name] = chr(value)
    return table


def keysym_value(name: str, table: dict):
    if name in XKB_DEAD:
        return XKB_DEAD[name]
    if name.startswith("dead_"):
        sys.exit(f"Touche morte xkb inconnue : {name}")
    if re.fullmatch(r"0x0?1[0-9a-fA-F]{6}", name):
        return chr(int(name, 16) - 0x01000000)
    if re.fullmatch(r"U[0-9A-Fa-f]{4,6}", name):
        return chr(int(name[1:], 16))
    if name not in table:
        sys.exit(f"Keysym inconnu : {name}")
    return table[name]


def is_case_pair(lower, upper) -> bool:
    return isinstance(lower, str) and len(lower) == 1 and lower.isalpha() and lower.islower() and upper == lower.upper()


def caps_layers(levels: list) -> list:
    """Couches Verr. Maj. selon libxkbcommon. Types automatiques de xkbcomp : ALPHABETIC si les niveaux 1-2
    et 3-4 forment des paires de casse, SEMIALPHABETIC si seuls 1-2, FOUR_LEVEL sinon. Le Verr. Maj. non
    consommé par le type met le caractère produit en majuscule."""
    l1, l2, l3, l4 = levels
    alpha12 = is_case_pair(l1, l2)
    alpha34 = alpha12 and is_case_pair(l3, l4)
    if alpha34:  # FOUR_LEVEL_ALPHABETIC : Lock consommé partout
        return [l2, l1, l4, l3]
    if alpha12:  # FOUR_LEVEL_SEMIALPHABETIC : Lock consommé aux niveaux 1-2, préservé aux niveaux 3-4
        return [l2, l1, upper1(l3), upper1(l4)]
    return [upper1(l1), upper1(l2), upper1(l3), upper1(l4)]  # FOUR_LEVEL : Lock jamais consommé


def extract_linux() -> dict:
    for name, (_, digest) in LINUX_FILES.items():
        check_sha(LINUX / name, digest)
    table = keysym_table()
    src = (LINUX / "symbols-fr").read_text(encoding="utf-8")
    block = src.split('xkb_symbols "oss" {', 1)[1].split("\n};", 1)[0]
    nbsp = (LINUX / "symbols-nbsp").read_text(encoding="utf-8")
    nbsp_block = nbsp.split('xkb_symbols "level3n" {', 1)[1].split("\n};", 1)[0]
    keymap = {}
    for text in (block, nbsp_block):  # level3n (espace) remplace la définition de base de <SPCE>
        for m in re.finditer(r"key <(\w+)>\s*\{\s*\[([^\]]*)\]", text):
            code = ISO_TO_CODE[XKB_TO_ISO[m.group(1)]]
            levels = [keysym_value(x.strip(), table) for x in m.group(2).split(",")]
            if len(levels) != 4:
                sys.exit(f"{m.group(1)} : {len(levels)} niveaux")
            c = caps_layers(levels)
            keymap[code] = [levels[0], levels[1], c[0], c[1], levels[2], levels[3], c[2], c[3]]
    direct = {v for values in keymap.values() for v in values if isinstance(v, str) and not v.startswith("dk_")}
    used = {v for values in keymap.values() for v in values if isinstance(v, str) and v.startswith("dk_")}
    deadkeys = {dk: {} for dk in sorted(used)}
    symbols = {}
    compose = (LINUX / "Compose.pre").read_text(encoding="utf-8")
    for line in compose.splitlines():
        m = re.match(r'<(dead_\w+)>\s+<(\w+)>\s*:\s*"((?:[^"\\]|\\.)*)"', line)
        if not m or m.group(1) not in XKB_DEAD or m.group(2).startswith("dead_") or m.group(2) == "Multi_key":
            continue
        dk = XKB_DEAD[m.group(1)]
        if dk not in deadkeys:
            continue
        try:
            base = keysym_value(m.group(2), table)
        except SystemExit:
            continue
        out = ud.normalize("NFC", m.group(3).replace('\\"', '"').replace("\\\\", "\\"))
        if base == " ":
            symbols[dk] = out
        if base in direct and len(out) == 1:
            deadkeys[dk].setdefault(base, out)
    missing = used - set(symbols)
    if missing:
        sys.exit(f"Touches mortes sans symbole (morte + espace) : {missing}")
    files = {name: {"source": desc, "sha256": digest} for name, (desc, digest) in LINUX_FILES.items()}
    return {
        "meta": {
            "id": "fr-oss",
            "name": "French (alt.)",
            "files": files,
            "capsModel": "libxkbcommon : types automatiques de xkbcomp et transformation de casse ; déduit, non relevé",
            "layers": LAYERS,
        },
        "keymap": keymap,
        "deadkeys": deadkeys,
        "deadKeyInfo": dead_info(symbols),
    }


# --- macOS -----------------------------------------------------------------------------------------------

MAC_SWAP = {"E00": "B00", "B00": "E00"}
# Couches CLDR → couches du coach (attribut `modifiers` du keyMap).
MAC_LAYERS = {
    "": ["Base"],
    "shift+caps? cmd+shiftL": ["Shift", "Caps+Shift"],
    "caps+cmd?": ["Caps"],
    "opt": ["AltGr"],
    "opt+shift+cmd?+caps?": ["Shift+AltGr", "Caps+Shift+AltGr"],
    "opt+caps+cmd?": ["Caps+AltGr"],
}


def extract_macos() -> dict:
    name, desc, digest = MACOS_FILE
    path = MACOS / name
    check_sha(path, digest)
    root = ET.parse(path).getroot()
    unesc = lambda s: re.sub(r"\\u\{([0-9A-Fa-f]+)\}", lambda m: chr(int(m.group(1), 16)), s)
    transforms = {unesc(t.get("from")): ud.normalize("NFC", unesc(t.get("to"))) for t in root.iter("transform")}
    dead_chars = {f[0] for f in transforms if len(f) == 2}
    if not dead_chars <= set(MAC_DEAD):
        sys.exit(f"Touches mortes macOS inconnues : {dead_chars - set(MAC_DEAD)}")
    keymap = {}
    seen_layers = set()
    for km in root.iter("keyMap"):
        layers = MAC_LAYERS.get(km.get("modifiers", ""))
        if layers is None:
            continue
        seen_layers.update(layers)
        for m in km.iter("map"):
            iso = m.get("iso")
            iso = MAC_SWAP.get(iso, iso)
            code = ISO_TO_CODE.get(iso)
            if code is None:
                continue
            out = ud.normalize("NFC", unesc(m.get("to")))
            value = MAC_DEAD[out] if out in dead_chars else out
            row = keymap.setdefault(code, [None] * 8)
            for layer in layers:
                row[LAYERS.index(layer)] = value
    if seen_layers != set(LAYERS):
        sys.exit(f"Couches macOS manquantes : {set(LAYERS) - seen_layers}")
    deadkeys, symbols = {}, {}
    for frm, out in transforms.items():
        if len(frm) != 2:
            continue
        dk = MAC_DEAD[frm[0]]
        if frm[1] == " ":
            symbols[dk] = out
        deadkeys.setdefault(dk, {})[frm[1]] = out
    expect = {"Backquote": "@", "IntlBackslash": "<", "Digit2": "é", "Backslash": "`"}
    bad = {k: keymap.get(k, [None])[0] for k, v in expect.items() if keymap.get(k, [None])[0] not in (v, MAC_DEAD.get(v))}
    if bad:
        sys.exit(f"Transcription macOS inattendue : {bad}")
    return {
        "meta": {
            "id": "macos-french",
            "name": "French",
            "files": {name: {"source": desc, "sha256": digest}},
            "reserve": "relevé d'OS X 10.9 (CLDR release-43) ; inversion E00/B00 des claviers ISO d'Apple corrigée",
            "layers": LAYERS,
        },
        "keymap": keymap,
        "deadkeys": deadkeys,
        "deadKeyInfo": dead_info(symbols),
    }


def main() -> None:
    check = "--check" in sys.argv
    stale = 0
    for path, data in ((LINUX / "fr-oss.json", extract_linux()), (MACOS / "fr.json", extract_macos())):
        text = json.dumps(data, ensure_ascii=False, indent=1) + "\n"
        previous = path.read_text(encoding="utf-8") if path.exists() else ""
        if previous == text:
            continue
        stale += 1
        if check:
            print(f"Périmé : {path.relative_to(ROOT)}", file=sys.stderr)
        else:
            path.write_text(text, encoding="utf-8", newline="\n")
            print(f"Écrit : {path.relative_to(ROOT)} ({len(data['keymap'])} touches, {sum(len(v) for v in data['deadkeys'].values())} compositions)")
    if check and stale:
        sys.exit(1)


if __name__ == "__main__":
    main()
