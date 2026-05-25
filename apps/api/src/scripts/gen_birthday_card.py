#!/usr/bin/env python3
"""Generate birthday card from PSD template.

psd-tools TypeLayer composite() returns pre-rendered raster data (cannot be
dynamically edited), so this script composites the PSD background with text
layers hidden, then overlays new text via Pillow + a bundled CJK TrueType font.

Usage: echo '{"xm":"张三","csrq":"2000-05-25","template":"/path/to/8.psd","output":"/tmp/card.png"}' | python3 gen_birthday_card.py
"""
import json
import os
import sys
from datetime import datetime as _datetime

from PIL import Image, ImageDraw, ImageFont


def calculate_date(csrq: str) -> str:
    parts = csrq.split("-")
    birth_year = parts[0]
    birth_month = parts[1]
    now = _datetime.now()
    current_year = now.year
    current_month = now.month
    return f"{birth_year}.{birth_month}-{current_year}.{current_month}"


def _get_text_params(psd, layer_name: str):
    """Extract text rendering parameters from the PSD TypeLayer metadata."""
    for layer in psd.descendants():
        if layer.name != layer_name:
            continue
        if not hasattr(layer, "engine_dict") or not layer.engine_dict:
            continue

        ed = layer.engine_dict
        run = ed.get("StyleRun", {}).get("RunArray", [{}])[0]
        ssd = run.get("StyleSheet", {}).get("StyleSheetData", {})
        fill_color = ssd.get("FillColor", {})
        values = fill_color.get("Values", [1.0, 1.0, 1.0, 1.0])

        font_size = float(ssd.get("FontSize", 30))
        color = (
            round(float(values[0]) * 255),
            round(float(values[1]) * 255),
            round(float(values[2]) * 255),
        )

        para_props = (
            ed.get("ParagraphRun", {})
            .get("RunArray", [{}])[0]
            .get("ParagraphSheet", {})
            .get("Properties", {})
        )
        justification = int(para_props.get("Justification", 0))

        return {
            "bbox": layer.bbox,
            "font_size": font_size,
            "color": color,
            "justification": justification,
        }

    return None


def _render_text(draw, text, x, y, font, color, justification, line_spacing=1.5):
    """Render text onto draw surface with given alignment."""
    lines = text.split("\r")
    line_height = font.size * line_spacing

    if justification == 2:  # center
        anchor = "mm"
        cursor_y = y - (len(lines) - 1) * line_height / 2
        for line in lines:
            draw.text((x, cursor_y), line, fill=color, font=font, anchor=anchor)
            cursor_y += line_height
    else:  # left / default
        anchor = "lm"
        cursor_y = y - (len(lines) - 1) * line_height / 2
        for line in lines:
            draw.text((x, cursor_y), line, fill=color, font=font, anchor=anchor)
            cursor_y += line_height


def generate(input_data: dict) -> None:
    xm = input_data["xm"]
    csrq = input_data["csrq"]
    template_path = input_data["template"]
    output_path = input_data["output"]

    if not os.path.isfile(template_path):
        print(json.dumps({"error": f"Template not found: {template_path}"}), flush=True)
        sys.exit(1)

    from psd_tools import PSDImage  # noqa: PLC0415

    psd = PSDImage.open(template_path)

    font_name = "NotoSansSC-Regular.ttf"

    # Try bundled font; fall back to PSD sibling dir (dist → image)
    script_dir = os.path.dirname(os.path.abspath(__file__))
    font_candidates = [
        os.path.join(script_dir, "..", "image", font_name),
        os.path.join(script_dir, "..", "..", "image", font_name),
        os.path.join(script_dir, "..", "..", "..", "image", font_name),
    ]

    font_path = None
    for candidate in font_candidates:
        resolved = os.path.normpath(candidate)
        if os.path.isfile(resolved):
            font_path = resolved
            break

    if not font_path:
        print(json.dumps({"error": f"Font {font_name} not found near {script_dir}"}), flush=True)
        sys.exit(1)

    # Collect text layer params
    name_params = _get_text_params(psd, "name")
    blessing_params = _get_text_params(psd, "blessing")
    date_params = _get_text_params(psd, "date")

    if not name_params or not blessing_params or not date_params:
        print(json.dumps({"error": "Required text layers (name/blessing/date) not found in PSD"}), flush=True)
        sys.exit(1)

    # Hide text layers, composite background only
    for layer in psd.descendants():
        if hasattr(layer, "engine_dict") and layer.engine_dict:
            layer.visible = False

    # Compute positions (center of bbox)
    def bbox_center(b):
        return (b[0] + b[2]) // 2, (b[1] + b[3]) // 2

    name_center = bbox_center(name_params["bbox"])
    blessing_center = bbox_center(blessing_params["bbox"])
    date_center = bbox_center(date_params["bbox"])

    # Background composite
    img = psd.composite(force=True)
    draw = ImageDraw.Draw(img)

    # Font
    font_regular = ImageFont.truetype(font_path, size=int(float(name_params["font_size"])))

    # Render name
    _render_text(
        draw,
        xm,
        name_center[0],
        name_center[1],
        font_regular,
        name_params["color"],
        name_params["justification"],
    )

    # Render blessing
    _render_text(
        draw,
        "徐州医科大学全体师生\r祝您生日快乐",
        blessing_center[0],
        blessing_center[1],
        font_regular,
        blessing_params["color"],
        blessing_params["justification"],
    )

    # Render date
    date_text = calculate_date(csrq)
    _render_text(
        draw,
        date_text,
        date_center[0],
        date_center[1],
        font_regular,
        date_params["color"],
        date_params["justification"],
    )

    os.makedirs(os.path.dirname(output_path) or ".", exist_ok=True)
    img.save(output_path, "PNG")
    print(json.dumps({"output": output_path}), flush=True)


if __name__ == "__main__":
    raw = sys.stdin.read()
    try:
        data = json.loads(raw)
    except json.JSONDecodeError as e:
        print(json.dumps({"error": f"Invalid JSON: {e}"}), flush=True)
        sys.exit(1)
    generate(data)
