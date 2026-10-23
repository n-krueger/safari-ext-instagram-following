"""Generate simple, original PNG icons using only Python's standard library."""

import pathlib
import struct
import zlib

OUTPUT = pathlib.Path(__file__).resolve().parent.parent / "extension" / "icons"


def chunk(kind, data):
    return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data))


def color(x, y):
    # White feed lines and checkmark on a teal background; coordinates are normalized.
    lines = (0.25 <= x <= 0.75 and 0.27 <= y <= 0.33) or (
        0.25 <= x <= 0.61 and 0.44 <= y <= 0.50
    )
    check = (0.27 <= x <= 0.44 and abs(y - (x + 0.35)) < 0.045) or (
        0.40 <= x <= 0.76 and abs(y - (1.19 - x)) < 0.045
    )
    return (255, 255, 255) if lines or check else (18, 108, 99)


OUTPUT.mkdir(parents=True, exist_ok=True)
for size in (128, 256, 512, 1024):
    rows = bytearray()
    for y in range(size):
        rows.append(0)  # PNG filter: none
        for x in range(size):
            # Four samples per pixel for antialiased edges.
            samples = [color((x + dx) / size, (y + dy) / size)
                       for dx, dy in ((0.25, 0.25), (0.75, 0.25), (0.25, 0.75), (0.75, 0.75))]
            rows.extend(sum(sample[c] for sample in samples) // 4 for c in range(3))
    png = b"\x89PNG\r\n\x1a\n"
    png += chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 2, 0, 0, 0))
    png += chunk(b"IDAT", zlib.compress(bytes(rows), 9))
    png += chunk(b"IEND", b"")
    (OUTPUT / f"icon-{size}.png").write_bytes(png)
