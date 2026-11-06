# -*- coding: utf-8 -*-
"""Extrait la table d'une disposition clavier Windows depuis sa DLL, au format 8 couches du coach.

Lecture seule. La DLL est chargée dans le processus Python (LoadLibrary via ctypes) pour appeler
son export `KbdLayerDescriptor` et parcourir les structures KBDTABLES de kbd.h. Aucun appel à
LoadKeyboardLayout, ActivateKeyboardLayout ni écriture de registre : le registre n'est ouvert
qu'en lecture (KEY_READ) pour retrouver KLID et nom affiché.

Couches (ordre de src/core/data.ts) : Base, Shift, Caps, Caps+Shift, AltGr, Shift+AltGr,
Caps+AltGr, Caps+Shift+AltGr. AltGr = Ctrl+Alt. Verr. Maj. appliqué comme le noyau
(xxxInternalToUnicode) : CAPLOK inverse Shift sans autre modificateur, CAPLOKALTGR inverse
Shift avec Ctrl+Alt, SGCAPS prend la ligne suivante sans autre modificateur que Shift.

Usage :
    python scripts/extract-kbd-dll.py kbdfr.dll kbdfrna.dll ...      (écrit sources/windows/<dll>.json)
    python scripts/extract-kbd-dll.py --compare <dump ToUnicodeEx.json> sources/windows/kbdfr.json
"""

from __future__ import annotations

import argparse
import ctypes
import hashlib
import json
import os
import struct
import sys
import unicodedata
import winreg
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = ROOT / "sources" / "windows"
SYSTEM32 = Path(os.environ.get("SystemRoot", r"C:\Windows")) / "System32"
LAYOUTS_KEY = r"SYSTEM\CurrentControlSet\Control\Keyboard Layouts"

LAYERS = ["Base", "Shift", "Caps", "Caps+Shift", "AltGr", "Shift+AltGr", "Caps+AltGr", "Caps+Shift+AltGr"]
# (shift, caps, altgr) par couche
LAYER_STATES = [(s, c, a) for (s, c, a) in [
    (0, 0, 0), (1, 0, 0), (0, 1, 0), (1, 1, 0), (0, 0, 1), (1, 0, 1), (0, 1, 1), (1, 1, 1)]]

# KeyboardEvent.code → scan code set 1 (mêmes 49 touches que scripts/build-data.ts ISO_POSITIONS).
SCANCODES = {
    "Backquote": 0x29,
    "Digit1": 0x02, "Digit2": 0x03, "Digit3": 0x04, "Digit4": 0x05, "Digit5": 0x06,
    "Digit6": 0x07, "Digit7": 0x08, "Digit8": 0x09, "Digit9": 0x0A, "Digit0": 0x0B,
    "Minus": 0x0C, "Equal": 0x0D,
    "KeyQ": 0x10, "KeyW": 0x11, "KeyE": 0x12, "KeyR": 0x13, "KeyT": 0x14,
    "KeyY": 0x15, "KeyU": 0x16, "KeyI": 0x17, "KeyO": 0x18, "KeyP": 0x19,
    "BracketLeft": 0x1A, "BracketRight": 0x1B,
    "KeyA": 0x1E, "KeyS": 0x1F, "KeyD": 0x20, "KeyF": 0x21, "KeyG": 0x22,
    "KeyH": 0x23, "KeyJ": 0x24, "KeyK": 0x25, "KeyL": 0x26,
    "Semicolon": 0x27, "Quote": 0x28, "Backslash": 0x2B,
    "IntlBackslash": 0x56,
    "KeyZ": 0x2C, "KeyX": 0x2D, "KeyC": 0x2E, "KeyV": 0x2F, "KeyB": 0x30,
    "KeyN": 0x31, "KeyM": 0x32, "Comma": 0x33, "Period": 0x34, "Slash": 0x35,
    "Space": 0x39,
}

WCH_NONE, WCH_DEAD, WCH_LGTR = 0xF000, 0xF001, 0xF002
CAPLOK, SGCAPS, CAPLOKALTGR, KANALOK = 0x01, 0x02, 0x04, 0x08
DKF_DEAD = 0x0001
SHFT_INVALID = 0x0F
KBDSHIFT, KBDCTRL, KBDALT = 0x01, 0x02, 0x04
KLLF = {0x0001: "KLLF_ALTGR", 0x0002: "KLLF_SHIFTLOCK", 0x0004: "KLLF_LRM_RLM"}

# Nom des touches mortes : vocabulaire du coach (data/azerty-global.json deadKeyInfo) quand il existe.
DEAD_NAMES = {
    "^": "circumflex", "ˆ": "circumflex", "¨": "diaeresis", "´": "acute", "`": "grave", "~": "tilde",
    "˜": "tilde", "˙": "dot_above", ".": "dot_below", "˝": "double_acute", "ˇ": "caron", "˛": "ogonek",
    "˘": "breve", "/": "stroke", "-": "horizontal_stroke", "¯": "macron", "¸": "cedilla", ",": "comma",
    "˚": "ring_above", "°": "inverted_breve", "˵": "double_grave", "ſ": "extended_latin", "µ": "greek",
    "¤": "currencies", "ˍ": "macron_below", "'": "apostrophe", '"': "quotation_mark",
}


class KbdTables(ctypes.Structure):
    _fields_ = [
        ("pCharModifiers", ctypes.c_void_p), ("pVkToWcharTable", ctypes.c_void_p),
        ("pDeadKey", ctypes.c_void_p), ("pKeyNames", ctypes.c_void_p),
        ("pKeyNamesExt", ctypes.c_void_p), ("pKeyNamesDead", ctypes.c_void_p),
        ("pusVSCtoVK", ctypes.c_void_p), ("bMaxVSCtoVK", ctypes.c_ubyte),
        ("pVSCtoVK_E0", ctypes.c_void_p), ("pVSCtoVK_E1", ctypes.c_void_p),
        ("fLocaleFlags", ctypes.c_uint32), ("nLgMax", ctypes.c_ubyte), ("cbLgEntry", ctypes.c_ubyte),
        ("pLigature", ctypes.c_void_p), ("dwType", ctypes.c_uint32), ("dwSubType", ctypes.c_uint32),
    ]


class VkToWcharTable(ctypes.Structure):
    _fields_ = [("pVkToWchars", ctypes.c_void_p), ("nModifications", ctypes.c_ubyte), ("cbSize", ctypes.c_ubyte)]


def dk_name(ch: str) -> str:
    return "dk_" + DEAD_NAMES.get(ch, "u%04x" % ord(ch))


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def file_version(path: Path) -> str | None:
    ver = ctypes.WinDLL("version.dll")
    size = ver.GetFileVersionInfoSizeW(str(path), None)
    if not size:
        return None
    buf = ctypes.create_string_buffer(size)
    if not ver.GetFileVersionInfoW(str(path), 0, size, buf):
        return None
    ptr, ln = ctypes.c_void_p(), ctypes.c_uint()
    ver.VerQueryValueW.argtypes = [ctypes.c_void_p, ctypes.c_wchar_p, ctypes.POINTER(ctypes.c_void_p), ctypes.POINTER(ctypes.c_uint)]
    if not ver.VerQueryValueW(buf, "\\", ctypes.byref(ptr), ctypes.byref(ln)):
        return None
    ms, ls = struct.unpack_from("<II", ctypes.string_at(ptr.value + 8, 8))
    return f"{ms >> 16}.{ms & 0xFFFF}.{ls >> 16}.{ls & 0xFFFF}"


def resolve_indirect(text: str | None) -> str | None:
    if not text or not text.startswith("@"):
        return text
    buf = ctypes.create_unicode_buffer(512)
    shlwapi = ctypes.WinDLL("shlwapi")
    if shlwapi.SHLoadIndirectString(text, buf, 512, None) == 0:
        return buf.value
    return None


def registry_entries(dll_name: str) -> list[dict]:
    """KLID dont « Layout File » désigne cette DLL (lecture seule)."""
    found = []
    with winreg.OpenKey(winreg.HKEY_LOCAL_MACHINE, LAYOUTS_KEY, 0, winreg.KEY_READ) as root:
        i = 0
        while True:
            try:
                klid = winreg.EnumKey(root, i)
            except OSError:
                break
            i += 1
            with winreg.OpenKey(root, klid, 0, winreg.KEY_READ) as key:
                values = {}
                for name in ("Layout File", "Layout Text", "Layout Display Name", "Layout Id"):
                    try:
                        values[name] = winreg.QueryValueEx(key, name)[0]
                    except OSError:
                        values[name] = None
            if (values["Layout File"] or "").lower() == dll_name.lower():
                found.append({
                    "klid": klid.lower(),
                    "layoutText": values["Layout Text"],
                    "displayName": resolve_indirect(values["Layout Display Name"]),
                    "layoutId": values["Layout Id"],
                })
    return sorted(found, key=lambda e: e["klid"])


# KLID de référence quand plusieurs entrées du registre partagent la DLL (kbdus.dll, kbdbe.dll).
EXPECTED_KLID = {
    "kbdfr.dll": "0000040c", "kbdfrna.dll": "0001040c", "kbdus.dll": "00000409", "kbduk.dll": "00000809",
    "kbdgr.dll": "00000407", "kbdsg.dll": "00000807", "kbdsp.dll": "0000040a", "kbdit.dll": "00000410",
    "kbdpo.dll": "00000816", "kbdbe.dll": "0000080c",
}


def primary_klid(dll_name: str, reg: list[dict]) -> str | None:
    klids = [r["klid"] for r in reg]
    expected = EXPECTED_KLID.get(dll_name.lower())
    if expected:
        if expected not in klids:
            raise RuntimeError(f"{dll_name} : KLID attendu {expected} absent du registre ({klids})")
        return expected
    return klids[0] if len(klids) == 1 else None


def read_tables(dll_path: Path):
    dll = ctypes.WinDLL(str(dll_path))  # LoadLibrary dans ce processus seulement
    fn = dll.KbdLayerDescriptor
    fn.argtypes, fn.restype = [], ctypes.c_void_p
    ptr = fn()
    if not ptr:
        raise RuntimeError("KbdLayerDescriptor a renvoyé NULL")
    t = KbdTables.from_address(ptr)

    # MODIFIERS : pVkToBit, wMaxModBits, ModNumber[]
    pm = t.pCharModifiers
    max_bits = ctypes.c_uint16.from_address(pm + 8).value
    mod_numbers = list(ctypes.string_at(pm + 10, max_bits + 1))
    vk_to_bit = []
    pvb = ctypes.c_void_p.from_address(pm).value
    for i in range(32):
        vk, bit = ctypes.string_at(pvb + 2 * i, 2)
        if vk == 0:
            break
        vk_to_bit.append({"vk": "0x%02X" % vk, "bit": bit})

    # VK_TO_WCHAR_TABLE[] : lignes ordonnées par table (la ligne suivante sert à SGCAPS et WCH_DEAD)
    rows = []  # (vk, attr, values, table_index, row_index_in_table)
    tables_report = []
    for ti in range(32):
        d = VkToWcharTable.from_address(t.pVkToWcharTable + ti * ctypes.sizeof(VkToWcharTable))
        if not d.pVkToWchars:
            break
        n, cb = d.nModifications, d.cbSize
        table_rows = []
        for ri in range(512):
            raw = ctypes.string_at(d.pVkToWchars + ri * cb, cb)
            if raw[0] == 0:
                break
            table_rows.append((raw[0], raw[1], list(struct.unpack_from("<%dH" % n, raw, 2))))
        rows.append(table_rows)
        tables_report.append({"modifications": n, "entrySize": cb, "rows": len(table_rows)})

    dead = []
    if t.pDeadKey:
        for i in range(4096):
            both, comp, flags = struct.unpack_from("<IHH", ctypes.string_at(t.pDeadKey + 8 * i, 8))
            if both == 0:
                break
            dead.append((chr(both >> 16), chr(both & 0xFFFF), chr(comp), flags))

    ligatures = {}
    if t.pLigature and t.cbLgEntry:
        for i in range(1024):
            raw = ctypes.string_at(t.pLigature + i * t.cbLgEntry, t.cbLgEntry)
            if raw[0] == 0:
                break
            mod = struct.unpack_from("<H", raw, 2)[0]
            chars = [c for c in struct.unpack_from("<%dH" % t.nLgMax, raw, 4) if c != WCH_NONE]
            ligatures[(raw[0], mod)] = "".join(map(chr, chars))

    vsc = {sc: ctypes.c_uint16.from_address(t.pusVSCtoVK + 2 * sc).value for sc in range(t.bMaxVSCtoVK + 1)}

    def names(p):
        out = {}
        if not p:
            return out
        for i in range(256):
            sc = ctypes.c_ubyte.from_address(p + 16 * i).value
            s = ctypes.c_void_p.from_address(p + 16 * i + 8).value
            if sc == 0 and not s:
                break
            out["0x%02X" % sc] = ctypes.wstring_at(s) if s else None
        return out

    dead_names = {}
    if t.pKeyNamesDead:
        for i in range(256):
            s = ctypes.c_void_p.from_address(t.pKeyNamesDead + 8 * i).value
            if not s:
                break
            w = ctypes.wstring_at(s)
            dead_names[w[0]] = w[1:]

    return {
        "tables": t, "mod_numbers": mod_numbers, "max_bits": max_bits, "vk_to_bit": vk_to_bit,
        "rows": rows, "tables_report": tables_report, "dead": dead, "ligatures": ligatures,
        "vsc": vsc, "key_names": names(t.pKeyNames), "dead_names": dead_names,
    }


def translate(data, vk: int, shift: bool, caps: bool, altgr: bool):
    """Équivalent de ToUnicodeEx sans état : renvoie str, ('dead', accent) ou None, plus l'attribut."""
    bits = (KBDSHIFT if shift else 0) | ((KBDCTRL | KBDALT) if altgr else 0)
    for table in data["rows"]:
        for idx, (rvk, attr, values) in enumerate(table):
            if rvk != vk:
                continue
            row = table[idx]
            b = bits
            if caps and attr & CAPLOK and (b & ~KBDSHIFT) == 0:
                b ^= KBDSHIFT
            if caps and attr & CAPLOKALTGR and (b & (KBDCTRL | KBDALT)) == (KBDCTRL | KBDALT):
                b ^= KBDSHIFT
            use = idx
            if caps and attr & SGCAPS and (b & ~KBDSHIFT) == 0:
                use = idx + 1
                row = table[use]
            mod = data["mod_numbers"][b] if b <= data["max_bits"] else SHFT_INVALID
            if mod == SHFT_INVALID or mod >= len(row[2]):
                return None, attr
            v = row[2][mod]
            if v == WCH_NONE:
                return None, attr
            if v == WCH_DEAD:
                nxt = table[use + 1] if use + 1 < len(table) else None
                if not nxt or nxt[0] != 0xFF:
                    raise RuntimeError(f"WCH_DEAD sans ligne 0xFF (vk 0x{vk:02X})")
                return ("dead", chr(nxt[2][mod])), attr
            if v == WCH_LGTR:
                return data["ligatures"].get((vk, mod)), attr
            return chr(v), attr
    return None, None


def extract(dll_name: str) -> dict:
    path = SYSTEM32 / dll_name
    if not path.is_file():
        raise FileNotFoundError(path)
    data = read_tables(path)
    t = data["tables"]
    keymap, attrs, vks = {}, {}, {}
    used_dead = {}
    for code, sc in SCANCODES.items():
        vk = data["vsc"].get(sc, 0) & 0xFF
        vks[code] = "0x%02X" % vk
        cells = []
        attr = None
        for shift, caps, altgr in LAYER_STATES:
            out, attr_ = translate(data, vk, shift, caps, altgr) if vk and vk != 0xFF else (None, None)
            attr = attr_ if attr_ is not None else attr
            if isinstance(out, tuple):
                used_dead[out[1]] = True
                out = dk_name(out[1])
            cells.append(out)
        keymap[code] = cells
        flags = [n for bit, n in ((CAPLOK, "CAPLOK"), (SGCAPS, "SGCAPS"), (CAPLOKALTGR, "CAPLOKALTGR"), (KANALOK, "KANALOK")) if (attr or 0) & bit]
        attrs[code] = flags

    deadkeys, dead_info = {}, {}
    accents = list(dict.fromkeys([a for a, *_ in data["dead"]] + list(used_dead)))
    for acc in accents:
        name = dk_name(acc)
        dead_info[name] = {
            "symbol": acc, "codePoint": "U+%04X" % ord(acc),
            "unicodeName": unicodedata.name(acc, None), "windowsName": data["dead_names"].get(acc),
        }
        table = {}
        for a, base, comp, flags in data["dead"]:
            if a != acc or base in table:  # Windows prend la première entrée
                continue
            table[base] = dk_name(comp) if flags & DKF_DEAD else comp
        deadkeys[name] = table
    names = [n for n in dead_info]
    if len(set(names)) != len(names):
        raise RuntimeError("collision de noms de touches mortes")

    reg = registry_entries(dll_name)
    caps_summary = {}
    for code, flags in attrs.items():
        caps_summary.setdefault("+".join(flags) or "aucun", []).append(code)
    return {
        "meta": {
            "dll": dll_name.lower(),
            "path": str(path),
            "fileVersion": file_version(path),
            "sha256": sha256(path),
            "extractedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "registry": reg,
            "klid": primary_klid(dll_name, reg),
            "localeFlags": "0x%08X" % t.fLocaleFlags,
            "flags": [n for bit, n in KLLF.items() if t.fLocaleFlags & bit],
            "kbdVersion": t.fLocaleFlags >> 16,
            "keyboardType": t.dwType, "keyboardSubType": t.dwSubType,
            "modifiers": {"vkToBit": data["vk_to_bit"], "modNumber": data["mod_numbers"]},
            "vkToWcharTables": data["tables_report"],
            "deadKeyEntries": len(data["dead"]),
            "ligatures": {f"0x{vk:02X}/{m}": s for (vk, m), s in data["ligatures"].items()},
            "method": "LoadLibrary + KbdLayerDescriptor, lecture de KBDTABLES (kbd.h) ; registre en KEY_READ ; "
                      "aucun LoadKeyboardLayout/ActivateKeyboardLayout",
            "layers": LAYERS,
            "virtualKeys": vks,
            "capsAttributes": attrs,
            "capsSummary": caps_summary,
        },
        "keymap": keymap,
        "deadkeys": deadkeys,
        "deadKeyInfo": dead_info,
    }


# ---------- validation contre un dump ToUnicodeEx (format tool-elipse) ----------

def compare(dump_path: Path, ours_path: Path) -> int:
    dump = json.loads(dump_path.read_text(encoding="utf-8"))
    ours = json.loads(ours_path.read_text(encoding="utf-8"))
    sym = {k: v["symbol"] for k, v in ours["deadKeyInfo"].items()}

    def norm(cell):
        if isinstance(cell, dict):
            return ("dead", cell["dead"])
        if isinstance(cell, str) and cell.startswith("dk_") and cell in sym:
            return ("dead", sym[cell])
        return cell

    cells = ok = 0
    diffs = []
    for code, row in dump["keymap"].items():
        mine = ours["keymap"].get(code)
        for i, cell in enumerate(row):
            cells += 1
            a, b = norm(cell), norm(mine[i]) if mine else None
            if a == b:
                ok += 1
            else:
                diffs.append(f"{code} {LAYERS[i]} : dump={a!r} dll={b!r}")
    # Compositions : le dump ne teste que les bases tapables directement (chaîne d'un caractère).
    bases = {c for row in dump["keymap"].values() for c in row if isinstance(c, str) and len(c) == 1}
    comp_total = comp_ok = 0
    comp_diffs = []
    mine_by_acc = {sym[k]: v for k, v in ours["deadkeys"].items()}
    for acc in sorted(set(dump["deadkeys"]) | set(mine_by_acc)):
        d = dump["deadkeys"].get(acc, {})
        m = {k: norm(v) for k, v in mine_by_acc.get(acc, {}).items() if k in bases}
        for base in sorted(set(d) | set(m)):
            comp_total += 1
            if norm(d.get(base)) == m.get(base):
                comp_ok += 1
            else:
                comp_diffs.append(f"{acc!r}+{base!r} : dump={norm(d.get(base))!r} dll={m.get(base)!r}")
    print(f"{ours_path.name} vs {dump_path.name} : cellules {ok}/{cells}, compositions {comp_ok}/{comp_total}")
    for line in diffs + comp_diffs:
        print("  ÉCART", line)
    return 0 if not diffs and not comp_diffs else 1


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("dlls", nargs="*")
    ap.add_argument("--compare", nargs=2, metavar=("DUMP", "EXTRAIT"))
    ap.add_argument("--out-dir", type=Path, default=OUT_DIR)
    args = ap.parse_args()
    if ctypes.sizeof(ctypes.c_void_p) != 8:
        raise SystemExit("Python 64 bits requis (DLL de System32)")
    if args.compare:
        return compare(Path(args.compare[0]), Path(args.compare[1]))
    args.out_dir.mkdir(parents=True, exist_ok=True)
    for name in args.dlls:
        payload = extract(name)
        out = args.out_dir / (Path(name).stem.lower() + ".json")
        out.write_text(json.dumps(payload, ensure_ascii=False, indent=1) + "\n", encoding="utf-8", newline="\n")
        m = payload["meta"]
        print(f"{out.name} : KLID {[r['klid'] for r in m['registry']]} {m['flags']} "
              f"{len(payload['deadkeys'])} mortes, {sum(map(len, payload['deadkeys'].values()))} compositions")
    return 0


if __name__ == "__main__":
    sys.exit(main())
