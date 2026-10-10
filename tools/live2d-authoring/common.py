"""live2d-authoring CLI 공용 유틸. 앱 본체와 독립적으로 동작한다(Pillow·numpy만 사용)."""
from __future__ import annotations

import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
AUTHORING_DIR = ROOT / "assets/live2d-authoring"
DEFAULT_PLAN = AUTHORING_DIR / "input/layer-plan.json"
DEFAULT_LAYERS = AUTHORING_DIR / "layers"
DEFAULT_OUTPUT = AUTHORING_DIR / "output"
CONTRACT = ROOT / "docs/live2d-layer-contract.json"

for _stream in (sys.stdout, sys.stderr):  # Windows cp949 콘솔에서 한글·화살표 깨짐 방지
    _stream.reconfigure(encoding="utf-8", errors="replace")

STATUSES = ("NOT_STARTED", "READY", "BLOCKED_INPUT", "REQUIRES_PSD_TOOL", "REQUIRES_EDITOR",
            "NEEDS_MANUAL_QA", "PASSED", "FAILED")


def now_iso() -> str:
    return datetime.now(timezone.utc).astimezone().strftime("%Y-%m-%dT%H:%M:%S%z")


def read_json(path: Path) -> dict:
    return json.loads(Path(path).read_text(encoding="utf-8"))


def write_json(path: Path, data: dict) -> Path:
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return path


def load_plan(path: Path) -> dict:
    """layer-plan.json을 읽고 계약 위반이 있으면 ValueError."""
    plan = read_json(path)
    errors = check_plan(plan)
    if errors:
        raise ValueError("layer-plan 계약 위반:\n  " + "\n  ".join(errors))
    return plan


def check_plan(plan: dict) -> list[str]:
    """docs/live2d-layer-contract.json 의 핵심 규칙을 외부 의존 없이 검사한다."""
    errs: list[str] = []
    for key in ("version", "model", "canvas", "sideConvention", "naming", "groups", "layers"):
        if key not in plan:
            errs.append(f"필수 키 누락: {key}")
    if errs:
        return errs
    if plan["version"] != 1:
        errs.append("version은 1이어야 함")
    if plan["sideConvention"] != "character":
        errs.append("sideConvention은 'character'여야 함")
    c = plan["canvas"]
    if (c.get("colorMode"), c.get("bitDepth"), c.get("colorProfile")) != ("RGB", 8, "sRGB"):
        errs.append("canvas는 RGB/8bit/sRGB여야 함(Cubism 권장)")
    for dim in ("width", "height"):
        if not isinstance(c.get(dim), int) or not 64 <= c[dim] <= 8192:
            errs.append(f"canvas.{dim} 범위 오류(64~8192)")
    pattern = re.compile(plan["naming"]["pattern"])
    group_re = re.compile(r"^[0-9]{2}_[A-Za-z_]+(/[A-Za-z]+)?$")
    groups = set(plan["groups"])
    for g in groups:
        if not group_re.match(g):
            errs.append(f"그룹명 규칙 위반: {g}")
    ids, zs = set(), set()
    for layer in plan["layers"]:
        lid = layer.get("id", "<no id>")
        if not pattern.match(lid):
            errs.append(f"레이어명 규칙 위반: {lid}")
        if lid in ids:
            errs.append(f"레이어 id 중복: {lid}")
        ids.add(lid)
        z = layer.get("z")
        if not isinstance(z, int):
            errs.append(f"{lid}: z는 정수여야 함")
        elif z in zs:
            errs.append(f"{lid}: z 중복 {z}")
        zs.add(z)
        if layer.get("group") not in groups:
            errs.append(f"{lid}: 미등록 그룹 {layer.get('group')}")
        side = layer.get("side")
        if side not in ("L", "R", None):
            errs.append(f"{lid}: side는 L/R/null")
        if side and not lid.endswith(f"_{side}") and f"_{side}_" not in lid:
            errs.append(f"{lid}: side={side} 인데 _{side} 표기가 없음")
        if "required" not in layer:
            errs.append(f"{lid}: required 누락")
        draft = layer.get("draft")
        if draft and (len(draft.get("roi", [])) != 4 or draft.get("color") not in
                      ("skin", "white", "red", "gray", "hair", "dark", "any")):
            errs.append(f"{lid}: draft 힌트 형식 오류")
    return errs


def is_export_excluded(plan: dict, layer_id: str) -> bool:
    return any(layer_id.endswith(s) for s in plan["naming"]["excludeSuffixes"])


def layers_sorted(plan: dict) -> list[dict]:
    return sorted(plan["layers"], key=lambda l: l["z"])


def resolve_layer_file(layers_dir: Path, layer_id: str) -> Path | None:
    """<id>.png 우선, 없으면 <id>_REF.png(초안)도 허용."""
    for name in (f"{layer_id}.png", f"{layer_id}_REF.png"):
        p = Path(layers_dir) / name
        if p.is_file():
            return p
    return None


def tool_versions() -> dict:
    out = {"python": sys.version.split()[0]}
    try:
        import PIL
        out["pillow"] = PIL.__version__
    except ImportError:
        out["pillow"] = None
    try:
        import numpy
        out["numpy"] = numpy.__version__
    except ImportError:
        out["numpy"] = None
    return out


def fail(msg: str, code: int = 2) -> None:
    print(f"ERROR: {msg}", file=sys.stderr)
    sys.exit(code)
