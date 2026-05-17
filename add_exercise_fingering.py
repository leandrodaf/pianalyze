#!/usr/bin/env python3
from __future__ import annotations

import json
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent
BASE = ROOT / "frontend" / "src" / "data" / "exercises"


def parse_notes(text: str) -> list[int]:
    return [int(part) for part in text.split()]


def mapped_fingers(notes: list[int], mapping: dict[int, int]) -> list[int]:
    return [mapping[note] for note in notes]


PITCH_NAMES = {
    0: "Dó",
    1: "Dó♯",
    2: "Ré",
    3: "Ré♯",
    4: "Mi",
    5: "Fá",
    6: "Fá♯",
    7: "Sol",
    8: "Sol♯",
    9: "Lá",
    10: "Lá♯",
    11: "Si",
}

EXACT_NOTE_NAMES = {
    48: "Dó3",
    50: "Ré3",
    53: "Fá3",
    55: "Sol3",
    57: "Lá3",
    59: "Si3",
    60: "Dó4",
    62: "Ré4",
    63: "Mi♭4",
    64: "Mi4",
    65: "Fá4",
    67: "Sol4",
    68: "Sol♯4",
    69: "Lá4",
    70: "Si♭4",
    71: "Si4",
    72: "Dó5",
    74: "Ré5",
    75: "Ré♯5",
    76: "Mi5",
    77: "Fá5",
    79: "Sol5",
}


def note_name(note: int) -> str:
    if note in EXACT_NOTE_NAMES:
        return EXACT_NOTE_NAMES[note]
    octave = note // 12 - 1
    return f"{PITCH_NAMES[note % 12]}{octave}"


SEQUENCES: dict[str, dict[str, object]] = {}


def add_sequence(rel_path: str, notes_text: str, fingers: list[int], tips: dict[int, str]) -> None:
    notes = parse_notes(notes_text)
    if len(notes) != len(fingers):
        raise ValueError(f"Finger count mismatch for {rel_path}: {len(notes)} notes vs {len(fingers)} fingers")
    if any(finger < 1 or finger > 5 for finger in fingers):
        raise ValueError(f"Invalid finger in {rel_path}")
    SEQUENCES[rel_path] = {
        "notes": notes,
        "fingers": fingers,
        "tips": tips,
    }


# Pieces
add_sequence(
    "pieces/twinkle.json",
    "60 60 67 67 69 69 67 65 65 64 64 62 62 60 67 67 65 65 64 64 62 67 67 65 65 64 64 62 60 60 67 67 69 69 67 65 65 64 64 62 62 60",
    mapped_fingers(
        parse_notes("60 60 67 67 69 69 67 65 65 64 64 62 62 60 67 67 65 65 64 64 62 67 67 65 65 64 64 62 60 60 67 67 69 69 67 65 65 64 64 62 62 60"),
        {60: 1, 62: 2, 64: 3, 65: 4, 67: 5, 69: 5},
    ),
    {
        0: "Polegar em Dó4 — início",
        4: "Estique para Lá4",
    },
)

add_sequence(
    "pieces/fur-elise.json",
    "76 75 76 75 76 71 74 72 69 60 64 69 71 64 68 71 72 76 75 76 75 76 71 74 72 69 60 64 69 71 64 68 71 72 76 75 76 75 76 71 74 72 69 60 64 69 71 64 68 71 72 76 75 76 75 76 71 74 72 69 60 64 69 71 64 74 72 69",
    [
        5, 4, 5, 4, 5, 2, 4, 3, 1,
        1, 2, 4, 1,
        1, 2, 3, 4,
        5, 4, 5, 4, 5, 2, 4, 3, 1,
        1, 2, 4, 1,
        1, 2, 3, 4,
        5, 4, 5, 4, 5, 2, 4, 3, 1,
        1, 2, 4, 1,
        1, 2, 3, 4,
        5, 4, 5, 4, 5, 2, 4, 3, 1,
        1, 2, 4, 1,
        1, 4, 3, 1,
    ],
    {
        0: "5-4-5 no motivo principal",
        9: "Polegar em Dó4 — início",
        13: "Polegar em Mi4 — nova posição",
        26: "Polegar em Dó4 — início",
        30: "Polegar em Mi4 — nova posição",
        43: "Polegar em Dó4 — início",
        47: "Polegar em Mi4 — nova posição",
        60: "Polegar em Dó4 — início",
        64: "Polegar em Mi4 — resolução final",
    },
)

add_sequence(
    "pieces/ode-to-joy.json",
    "64 64 65 67 67 65 64 62 60 60 62 64 64 62 62 64 64 65 67 67 65 64 62 60 60 62 64 62 60 60 62 62 64 60 62 64 65 64 60 62 64 65 64 62 60 62 55 64 64 65 67 67 65 64 62 60 60 62 64 64 62 62 64 64 65 67 67 65 64 62 60 60 62 64 62 60 60 60",
    mapped_fingers(
        parse_notes("64 64 65 67 67 65 64 62 60 60 62 64 64 62 62 64 64 65 67 67 65 64 62 60 60 62 64 62 60 60 62 62 64 60 62 64 65 64 60 62 64 65 64 62 60 62 55 64 64 65 67 67 65 64 62 60 60 62 64 64 62 62 64 64 65 67 67 65 64 62 60 60 62 64 62 60 60 60"),
        {55: 2, 60: 1, 62: 2, 64: 3, 65: 4, 67: 5},
    ),
    {
        0: "Posição de Dó — polegar em Dó4",
        46: "Alcance Sol3 com dedo 2",
    },
)

add_sequence(
    "pieces/happy-birthday.json",
    "60 60 62 60 65 64 60 60 62 60 67 65 60 60 72 69 65 64 62 70 70 69 65 67 65",
    [1, 1, 2, 1, 4, 3, 1, 1, 2, 1, 5, 4, 1, 1, 5, 4, 2, 1, 2, 4, 4, 3, 1, 2, 1],
    {
        0: "Polegar em Dó4 — início",
        14: "Suba a mão para Dó5",
        19: "Si♭4 com dedo 4",
    },
)

add_sequence(
    "pieces/jingle-bells.json",
    "64 64 64 64 64 64 64 67 60 62 64 65 65 65 65 65 64 64 64 64 62 62 64 62 67 64 64 64 64 64 64 64 67 60 62 64 65 65 65 65 65 64 64 64 67 67 65 62 60",
    mapped_fingers(
        parse_notes("64 64 64 64 64 64 64 67 60 62 64 65 65 65 65 65 64 64 64 64 62 62 64 62 67 64 64 64 64 64 64 64 67 60 62 64 65 65 65 65 65 64 64 64 67 67 65 62 60"),
        {60: 1, 62: 2, 64: 3, 65: 4, 67: 5},
    ),
    {
        0: "Posição de Dó — polegar em Dó4",
    },
)

add_sequence(
    "pieces/mary-had-a-little-lamb.json",
    "64 62 60 62 64 64 64 62 62 62 64 67 67 64 62 60 62 64 64 64 64 62 62 64 62 60",
    mapped_fingers(
        parse_notes("64 62 60 62 64 64 64 62 62 62 64 67 67 64 62 60 62 64 64 64 64 62 62 64 62 60"),
        {60: 1, 62: 2, 64: 3, 67: 5},
    ),
    {
        0: "Posição de Dó — polegar em Dó4",
    },
)

add_sequence(
    "pieces/hot-cross-buns.json",
    "64 62 60 64 62 60 60 60 60 60 62 62 62 62 64 62 60",
    mapped_fingers(
        parse_notes("64 62 60 64 62 60 60 60 60 60 62 62 62 62 64 62 60"),
        {60: 1, 62: 2, 64: 3},
    ),
    {
        0: "Posição de Dó — polegar em Dó4",
    },
)

add_sequence(
    "pieces/frere-jacques.json",
    "60 62 64 60 60 62 64 60 64 65 67 64 65 67 67 69 67 65 64 60 67 69 67 65 64 60 60 55 60 60 55 60",
    mapped_fingers(
        parse_notes("60 62 64 60 60 62 64 60 64 65 67 64 65 67 67 69 67 65 64 60 67 69 67 65 64 60 60 55 60 60 55 60"),
        {55: 2, 60: 1, 62: 2, 64: 3, 65: 4, 67: 5, 69: 5},
    ),
    {
        0: "Posição de Dó — polegar em Dó4",
        15: "Estique para Lá4",
        27: "Alcance Sol3 com dedo 2",
    },
)

add_sequence(
    "pieces/london-bridge.json",
    "67 69 67 65 64 65 67 62 64 65 64 65 67 67 69 67 65 64 65 67 62 67 64 60 60",
    mapped_fingers(
        parse_notes("67 69 67 65 64 65 67 62 64 65 64 65 67 67 69 67 65 64 65 67 62 67 64 60 60"),
        {60: 1, 62: 2, 64: 3, 65: 4, 67: 5, 69: 5},
    ),
    {
        0: "Posição de Dó — polegar em Dó4",
        1: "Estique para Lá4",
    },
)

add_sequence(
    "pieces/amazing-grace.json",
    "55 60 64 67 64 67 64 60 64 62 60 64 67 69 67 64 60 64 62 60",
    mapped_fingers(
        parse_notes("55 60 64 67 64 67 64 60 64 62 60 64 67 69 67 64 60 64 62 60"),
        {55: 1, 60: 1, 62: 2, 64: 3, 67: 5, 69: 5},
    ),
    {
        0: "Polegar em Sol3 — anacruse",
        1: "Polegar em Dó4 — início",
        13: "Estique para Lá4",
    },
)

add_sequence(
    "pieces/yankee-doodle.json",
    "60 60 62 64 60 64 62 60 60 62 64 60 64 64 65 64 62 64 65 67 67 65 64 62 60 67 67 69 67 65 67 69 70 67 65 64 62 60",
    mapped_fingers(
        parse_notes("60 60 62 64 60 64 62 60 60 62 64 60 64 64 65 64 62 64 65 67 67 65 64 62 60 67 67 69 67 65 67 69 70 67 65 64 62 60"),
        {60: 1, 62: 2, 64: 3, 65: 4, 67: 5, 69: 5, 70: 4},
    ),
    {
        0: "Posição de Dó — polegar em Dó4",
        27: "Estique para Lá4",
        32: "Si♭4 com dedo 4",
    },
)

add_sequence(
    "pieces/old-macdonald.json",
    "60 60 60 55 57 57 55 64 64 62 62 60 60 60 60 55 57 57 55 55 55 55 55 55 55 55 64 64 62 62 60",
    mapped_fingers(
        parse_notes("60 60 60 55 57 57 55 64 64 62 62 60 60 60 60 55 57 57 55 55 55 55 55 55 55 55 64 64 62 62 60"),
        {55: 2, 57: 1, 60: 1, 62: 2, 64: 3},
    ),
    {
        0: "Posição de Dó — polegar em Dó4",
        3: "Desça para Sol3 com dedo 2",
    },
)

add_sequence(
    "pieces/when-the-saints.json",
    "60 64 65 67 60 64 65 67 67 64 60 64 60 64 67 69 67 64 60 64 65 67 67 64 67 69 67 65 64 62 60",
    mapped_fingers(
        parse_notes("60 64 65 67 60 64 65 67 67 64 60 64 60 64 67 69 67 64 60 64 65 67 67 64 67 69 67 65 64 62 60"),
        {60: 1, 62: 2, 64: 3, 65: 4, 67: 5, 69: 5},
    ),
    {
        0: "Polegar em Dó4 — início",
        15: "Estique para Lá4",
    },
)

# Special scales
add_sequence(
    "scales/a-blues-scale.json",
    "57 60 62 63 64 67 69 67 64 63 62 60 57",
    [1, 2, 3, 1, 2, 3, 4, 3, 2, 1, 3, 2, 1],
    {
        0: "Polegar em Lá3 — início",
        3: "Mi♭4 — blue note; cruzar polegar",
        10: "Passar dedo sobre polegar",
    },
)

add_sequence(
    "scales/a-pentatonic-minor-scale.json",
    "57 60 62 64 67 69 67 64 62 60 57",
    [1, 2, 3, 1, 2, 3, 2, 1, 3, 2, 1],
    {
        0: "Polegar em Lá3 — início",
        3: "Cruzar polegar",
        8: "Passar dedo sobre polegar",
    },
)

add_sequence(
    "scales/c-pentatonic-major-scale.json",
    "60 62 64 67 69 72 69 67 64 62 60",
    [1, 2, 3, 1, 2, 3, 2, 1, 3, 2, 1],
    {
        0: "Polegar em Dó4 — início",
        3: "Cruzar polegar",
        8: "Passar dedo sobre polegar",
    },
)

add_sequence(
    "scales/a-harmonic-minor-scale.json",
    "57 59 60 62 64 65 68 69 68 65 64 62 60 59 57",
    [1, 2, 3, 1, 2, 3, 4, 5, 4, 3, 2, 1, 3, 2, 1],
    {
        0: "Polegar em Lá3 — início",
        3: "Cruzar polegar",
        6: "Sol♯4 — 7ª maior característica",
        12: "Passar dedo sobre polegar",
    },
)

CHORD_FILES = {
    "chords/i-iv-v-i.json",
    "chords/i-v-vi-iv.json",
    "chords/ii-v-i.json",
    "chords/inversions.json",
    "chords/jazz-voicings.json",
    "chords/minor-progression.json",
    "chords/seventh-chords.json",
    "chords/twelve-bar-blues.json",
}


TARGET_FILES = set(SEQUENCES) | CHORD_FILES


def reorder_field(event: dict, key: str, value, after_key: str) -> dict:
    items = []
    inserted = False
    for existing_key, existing_value in event.items():
        if existing_key == key:
            continue
        items.append((existing_key, existing_value))
        if existing_key == after_key:
            items.append((key, value))
            inserted = True
    if not inserted:
        items.append((key, value))
    return dict(items)


def set_finger(event: dict, finger: int) -> dict:
    if "finger" in event:
        return event
    return reorder_field(event, "finger", finger, "vel")


def set_tip(event: dict, tip: str) -> dict:
    target_after = "hand" if "hand" in event else "finger"
    return reorder_field(event, "tip", tip, target_after)


def chord_assignment(notes: list[int]) -> tuple[list[int], str]:
    notes = sorted(notes)
    span = notes[-1] - notes[0]
    intervals = [b - a for a, b in zip(notes, notes[1:])]

    if span > 12 and notes[0] <= 55:
        if len(notes) == 3:
            return [5, 1, 5], f"Voicing aberto — baixo em {note_name(notes[0])} com 5"
        if len(notes) == 4:
            return [5, 1, 3, 5], f"Voicing aberto — baixo em {note_name(notes[0])} com 5"

    if len(notes) == 4:
        return [1, 2, 4, 5], f"Polegar em {note_name(notes[0])} — 1-2-4-5: acorde de 7ª"

    if len(notes) != 3:
        raise ValueError(f"Unsupported chord size: {notes}")

    if intervals in ([4, 3], [3, 4]):
        return [1, 3, 5], f"Polegar em {note_name(notes[0])} — 1-3-5: acorde"
    if intervals in ([3, 5], [4, 5]):
        return [1, 2, 5], f"Polegar em {note_name(notes[0])} — 1-2-5: 1ª inversão"
    if intervals in ([5, 4], [5, 3]):
        return [1, 2, 4], f"Polegar em {note_name(notes[0])} — 1-2-4: 2ª inversão"

    raise ValueError(f"Unsupported chord shape: {notes} with intervals {intervals}")


def process_sequence_file(rel_path: str) -> bool:
    path = BASE / rel_path
    data = json.loads(path.read_text(encoding="utf-8"))
    note_ons = [event for event in data["events"] if event.get("cmd") == 144 and event.get("vel", 0) > 0]

    plan = SEQUENCES[rel_path]
    expected_notes = plan["notes"]
    if [event["note"] for event in note_ons] != expected_notes:
        raise ValueError(f"Unexpected notes in {rel_path}")

    changed = False
    tips: dict[int, str] = plan["tips"]  # type: ignore[assignment]
    fingers: list[int] = plan["fingers"]  # type: ignore[assignment]

    note_on_index = 0
    new_events = []
    for event in data["events"]:
        if event.get("cmd") == 144 and event.get("vel", 0) > 0:
            updated = set_finger(event, fingers[note_on_index])
            if note_on_index in tips:
                updated = set_tip(updated, tips[note_on_index])
            changed = changed or updated != event
            new_events.append(updated)
            note_on_index += 1
        else:
            new_events.append(event)

    data["events"] = new_events
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return changed


def process_chord_file(rel_path: str) -> bool:
    path = BASE / rel_path
    data = json.loads(path.read_text(encoding="utf-8"))

    groups: dict[int, list[dict]] = defaultdict(list)
    for event in data["events"]:
        if event.get("cmd") == 144 and event.get("vel", 0) > 0:
            groups[event["t"]].append(event)

    assignments: dict[int, tuple[dict[int, int], str]] = {}
    for timestamp, group in groups.items():
        sorted_notes = sorted(event["note"] for event in group)
        fingers, tip = chord_assignment(sorted_notes)
        assignments[timestamp] = (dict(zip(sorted_notes, fingers)), tip)

    changed = False
    seen_timestamps: set[int] = set()
    new_events = []
    for event in data["events"]:
        if event.get("cmd") == 144 and event.get("vel", 0) > 0:
            finger_map, tip = assignments[event["t"]]
            updated = set_finger(event, finger_map[event["note"]])
            if event["t"] not in seen_timestamps and event["note"] == min(finger_map):
                updated = set_tip(updated, tip)
                seen_timestamps.add(event["t"])
            changed = changed or updated != event
            new_events.append(updated)
        else:
            new_events.append(event)

    data["events"] = new_events
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return changed


def main() -> None:
    changed_files = []
    for rel_path in sorted(TARGET_FILES):
        changed = process_chord_file(rel_path) if rel_path in CHORD_FILES else process_sequence_file(rel_path)
        if changed:
            changed_files.append(rel_path)
            print(f"updated {rel_path}")
        else:
            print(f"no changes {rel_path}")

    print(f"\n{len(changed_files)} files updated")


if __name__ == "__main__":
    main()
