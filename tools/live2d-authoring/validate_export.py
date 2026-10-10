"""Cubism 출력물(.model3.json) 참조 무결성 검사.

    python tools/live2d-authoring/validate_export.py --model <path/to/X.model3.json> [--out <dir>]

검사: Version/FileReferences(Moc·Textures·Physics·Pose·DisplayInfo·Expressions·Motions) 상대 경로 실재,
.moc3 매직('MOC3'), 텍스처 PNG 열림, Groups(EyeBlink/LipSync) Ids, HitAreas. 가짜 파일을 만들지 않으며
없는 파일은 그대로 FAILED로 보고한다(명세 15.1). 종료 코드 0=PASSED, 1=FAILED, 2=BLOCKED_INPUT
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from common import DEFAULT_OUTPUT, now_iso, write_json

EXPECTED_PARAMS = ["ParamAngleX", "ParamAngleY", "ParamAngleZ", "ParamEyeLOpen", "ParamEyeROpen",
                   "ParamEyeBallX", "ParamEyeBallY", "ParamMouthOpenY", "ParamMouthForm",
                   "ParamBodyAngleX", "ParamBodyAngleY", "ParamBodyAngleZ", "ParamBreath"]


def check_file(base: Path, rel: str, kind: str, result: dict) -> Path | None:
    p = (base / rel).resolve()
    entry = {"kind": kind, "path": rel, "exists": p.is_file()}
    if Path(rel).is_absolute() or ".." in Path(rel).parts:
        entry["error"] = "절대 경로 또는 상위 참조(배포 시 깨짐)"
    if not entry["exists"]:
        entry["error"] = entry.get("error") or "파일 없음"
    else:
        entry["bytes"] = p.stat().st_size
    result["files"].append(entry)
    if "error" in entry:
        result["errors"].append(f"{kind} {rel}: {entry['error']}")
        return None
    return p


def validate(model_path: Path) -> dict:
    result = {"generatedAt": now_iso(), "model": str(model_path), "files": [], "errors": [], "warnings": [],
              "status": "FAILED"}
    try:
        model = json.loads(model_path.read_text(encoding="utf-8"))
    except Exception as e:
        result["errors"].append(f"model3.json 파싱 실패: {e}")
        return result
    base = model_path.parent
    if model.get("Version") != 3:
        result["errors"].append(f"Version 3 아님: {model.get('Version')}")
    refs = model.get("FileReferences", {})
    moc = refs.get("Moc")
    if not moc:
        result["errors"].append("FileReferences.Moc 없음")
    else:
        p = check_file(base, moc, "Moc", result)
        if p:
            with p.open("rb") as f:
                magic = f.read(4)
            if magic != b"MOC3":
                result["errors"].append(f"Moc 매직 불일치 {magic!r}(.moc3 아님)")
    textures = refs.get("Textures") or []
    if not textures:
        result["errors"].append("FileReferences.Textures 비어 있음")
    for t in textures:
        p = check_file(base, t, "Texture", result)
        if p:
            try:
                from PIL import Image
                with Image.open(p) as im:
                    if im.format != "PNG":
                        result["warnings"].append(f"텍스처 {t}: PNG 아님({im.format})")
            except Exception as e:
                result["errors"].append(f"텍스처 {t} 열기 실패: {e}")
    for key in ("Physics", "Pose", "DisplayInfo", "UserData"):
        if refs.get(key):
            check_file(base, refs[key], key, result)
    for exp in refs.get("Expressions") or []:
        if exp.get("File"):
            check_file(base, exp["File"], f"Expression:{exp.get('Name')}", result)
    motions = refs.get("Motions") or {}
    for group, items in motions.items():
        for m in items:
            if m.get("File"):
                check_file(base, m["File"], f"Motion:{group}", result)
            if m.get("Sound"):
                check_file(base, m["Sound"], f"Sound:{group}", result)
    result["motionGroups"] = sorted(motions)
    result["expressions"] = [e.get("Name") for e in refs.get("Expressions") or []]
    groups = {g.get("Name"): g.get("Ids", []) for g in model.get("Groups") or []}
    result["groups"] = groups
    for name in ("EyeBlink", "LipSync"):
        if name not in groups:
            result["warnings"].append(f"Groups.{name} 없음(자동 깜빡임/립싱크 비활성)")
    result["hitAreas"] = [h.get("Name") for h in model.get("HitAreas") or []]
    if not result["hitAreas"]:
        result["warnings"].append("HitAreas 없음(클릭 반응은 플레이스홀더 히트 영역으로 대체)")
    result["parameterChecklist"] = {"note": "파라미터 ID 실재 여부는 런타임(Cubism Core) 로드 후 확인. 여기선 기대 목록만 기록",
                                    "expected": EXPECTED_PARAMS}
    result["status"] = "FAILED" if result["errors"] else ("NEEDS_MANUAL_QA" if result["warnings"] else "PASSED")
    return result


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--model", type=Path, required=True, help="*.model3.json")
    ap.add_argument("--out", type=Path, default=DEFAULT_OUTPUT / "latest")
    args = ap.parse_args()
    if not args.model.is_file():
        print(f"[BLOCKED_INPUT] model3.json 없음: {args.model} — Cubism Editor에서 'Export as MOC3' 후 다시 실행")
        sys.exit(2)
    result = validate(args.model)
    out = write_json(args.out / "model-export-validation.json", result)
    print(f"[{result['status']}] {args.model.name}: {len(result['files'])} refs, "
          f"{len(result['errors'])} errors, {len(result['warnings'])} warnings → {out}")
    for e in result["errors"]:
        print("  ERROR", e)
    for w in result["warnings"]:
        print("  warn ", w)
    sys.exit(1 if result["errors"] else 0)


if __name__ == "__main__":
    main()
