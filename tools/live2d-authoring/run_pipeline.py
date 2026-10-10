"""원화 → 초안 분리 → 검증 → 미리보기 → PSD → (model3 검증) 을 한 번에 돌리고 보고서를 쓴다.

    python tools/live2d-authoring/run_pipeline.py --build-id 2026-10-10-a \
        [--input assets/reference/kiriko.png] [--plan ...] [--layers assets/live2d-authoring/layers] \
        [--model path/to/X.model3.json] [--out-root assets/live2d-authoring/output]

Cubism Editor가 필요한 단계(리깅·moc3 내보내기)는 실행하지 않고 REQUIRES_EDITOR 로 기록만 한다.
산출물: output/<build-id>/{source-info.json, layers-draft/, layer-validation.json, composite.png,
contact-sheet.png, character_layers.psd, model-export-validation.json, cubism-import-checklist.md, asset-build-report.md}
"""
from __future__ import annotations

import argparse
import os
import sys
import traceback
from pathlib import Path

from common import (AUTHORING_DIR, DEFAULT_LAYERS, DEFAULT_OUTPUT, DEFAULT_PLAN, ROOT, layers_sorted, load_plan,
                    now_iso, read_json, tool_versions, write_json)

CUBISM_HINTS = [Path(r"C:\Program Files\Live2D Cubism 5.2"), Path(r"C:\Program Files\Live2D Cubism 5.1"),
                Path(r"C:\Program Files\Live2D Cubism 5.0"), Path(r"C:\Program Files\Live2D Cubism 4.2"),
                Path(os.environ.get("LOCALAPPDATA", "")) / "Programs" / "Live2D Cubism"]


def detect_cubism() -> dict:
    env = os.environ.get("CUBISM_EDITOR_HOME")
    for p in ([Path(env)] if env else []) + CUBISM_HINTS:
        if p.is_dir():
            return {"installed": True, "path": str(p)}
    return {"installed": False, "path": None, "hint": "CUBISM_EDITOR_HOME 환경 변수로 경로 지정 가능"}


def step(report: dict, name: str, fn):
    """예외를 FAILED 로 기록하고 파이프라인은 계속 진행."""
    try:
        result = fn()
    except Exception as e:  # noqa: BLE001
        result = {"status": "FAILED", "error": f"{type(e).__name__}: {e}", "trace": traceback.format_exc(limit=3)}
    report["steps"][name] = result
    print(f"  {name:<18} {result.get('status', '?')}")
    return result


def checklist_md(plan: dict, report: dict, build_dir: Path) -> str:
    groups = sorted({l["group"] for l in plan["layers"]})
    required = [l for l in plan["layers"] if l["required"]]
    psd = report["steps"].get("assemble_psd", {})
    lines = [f"# Cubism 임포트 체크리스트 — build `{report['buildId']}`", "",
             f"- 생성: {report['generatedAt']}  · 모델: `{plan['model']['name']}` ({plan['model']['scope']})",
             f"- 캔버스: {plan['canvas']['width']}x{plan['canvas']['height']} RGB 8bit sRGB",
             f"- PSD: `{psd.get('file', '(미생성)')}` 상태 **{psd.get('status', 'NOT_STARTED')}**"
             + (" · EXPERIMENTAL(비Photoshop 작성)" if psd.get("experimental") else ""),
             f"- 레이어 {len(plan['layers'])}개(필수 {len(required)}) · 그룹 {len(groups)}개", "",
             "## 임포트 전(사람)", "",
             "- [ ] `_REF`/`_GUIDE`/`_TMP` 접미사 레이어 삭제 또는 숨김 확인(Cubism은 숨김 레이어도 임포트함)",
             "- [ ] 모든 레이어가 동일 캔버스 크기·RGBA 인지 `layer-validation.json` 의 status 확인(PASSED 또는 NEEDS_MANUAL_QA 허용 사유 기록)",
             "- [ ] 복원 레이어(가려진 부분 그려넣기) 완료: " + ", ".join(l["id"] for l in plan["layers"] if l.get("restore")),
             "- [ ] 눈·입 파츠는 분리 상태(흰자/홍채/동공/하이라이트/위아래 눈꺼풀/속눈썹, 입 안/이/혀/벌림/선)", "",
             "## Cubism Editor(REQUIRES_EDITOR)", "",
             "- [ ] File → Open 으로 PSD 임포트, 레이어 → ArtMesh 자동 변환 확인(그룹명·레이어명 보존 여부)",
             "- [ ] 드로우 오더: PSD 그룹 순서는 그룹 내 최대 z 기준이므로 `layer-plan.json` 의 z 와 다른 곳(팔 L 등) 수동 정렬",
             "- [ ] 표준 파라미터 ID 사용: ParamAngleX/Y/Z, ParamEyeLOpen/ROpen, ParamEyeBallX/Y, ParamMouthOpenY, ParamMouthForm, ParamBodyAngleX/Y/Z, ParamBreath",
             "- [ ] Groups: EyeBlink(ParamEyeLOpen, ParamEyeROpen), LipSync(ParamMouthOpenY) 등록",
             "- [ ] HitAreas: Head, Body 설정",
             "- [ ] 텍스처 아틀라스 2048 이하, 모션 idle/tap/greeting 최소 1개씩",
             "- [ ] File → Export → Export as MOC3 (.model3.json + .moc3 + textures + physics3.json)", "",
             "## 내보내기 후(자동 검증)", "",
             "```", f"python tools/live2d-authoring/validate_export.py --model <export>/{plan['model']['id']}.model3.json --out {build_dir.as_posix()}",
             "```", "", "- [ ] model-export-validation.json 이 PASSED 또는 NEEDS_MANUAL_QA(사유 확인)",
             "- [ ] 앱에서 `assets/models/private/<id>/` 로 복사 후 플레이스홀더 대신 로드되는지 확인(작업 10)", ""]
    return "\n".join(lines)


def report_md(plan: dict, report: dict) -> str:
    s = report["steps"]
    lines = [f"# Live2D 에셋 빌드 보고서 — `{report['buildId']}`", "",
             f"- 생성 시각: {report['generatedAt']}",
             f"- 도구: " + ", ".join(f"{k} {v}" for k, v in report["tools"].items()),
             f"- 계획: `{report['plan']}` ({len(plan['layers'])} layers)",
             f"- Cubism Editor: " + ("설치됨 " + report["cubism"]["path"] if report["cubism"]["installed"]
                                      else "미설치(REQUIRES_EDITOR 단계는 수동)"),
             f"- 권리 상태: {report['rights']}", "",
             "| 단계 | 상태 | 비고 |", "|---|---|---|"]
    notes = {
        "plan": lambda r: f"{r.get('layers', 0)} layers, {r.get('groups', 0)} groups",
        "prepare_artwork": lambda r: f"{r.get('width')}x{r.get('height')} {r.get('mode')}, alpha {r.get('alpha', {}).get('coverage')}; " + "; ".join(r.get("checks", [])),
        "draft_split": lambda r: f"{len(r.get('layers', []))} drafts, empty {len(r.get('empty', []))}: {', '.join(r.get('empty', [])[:8])}",
        "validate_layers": lambda r: f"{len(r.get('layers', []))} checked, missing required {len(r.get('missingRequired', []))}, errors {r.get('errors', 0)}, warnings {r.get('warnings', 0)}",
        "validate_drafts": lambda r: f"{len(r.get('layers', []))} drafts checked, errors {r.get('errors', 0)}, warnings {r.get('warnings', 0)}",
        "export_previews": lambda r: ", ".join(r.get("files", [])),
        "assemble_psd": lambda r: f"{r.get('layers', 0)} layers / {r.get('groups', 0)} groups, {r.get('bytes', 0):,} bytes; " + "; ".join(r.get("notes", []) + r.get("verify", [])),
        "validate_export": lambda r: "; ".join(r.get("errors", [])[:5] + r.get("warnings", [])[:3]) or r.get("reason", ""),
        "cubism_rigging": lambda r: r.get("reason", ""),
    }
    for name, r in s.items():
        note = r.get("error") or notes.get(name, lambda r: "")(r)
        lines.append(f"| {name} | **{r.get('status', '?')}** | {note} |")
    lines += ["", "## 산출물", ""] + [f"- `{f}`" for f in report["files"]] + ["", "## 수동 QA 필요", ""]
    lines += [f"- {m}" for m in report["manualQa"]] or ["- 없음"]
    lines += ["", "## 다음 단계", ""] + [f"- {n}" for n in report["next"]]
    return "\n".join(lines) + "\n"


def run(build_id: str, plan_path: Path, src: Path | None, layers_dir: Path, model: Path | None, out_root: Path) -> dict:
    build_dir = out_root / build_id
    build_dir.mkdir(parents=True, exist_ok=True)
    report: dict = {"buildId": build_id, "generatedAt": now_iso(), "tools": tool_versions(), "plan": str(plan_path),
                    "cubism": detect_cubism(), "steps": {}, "files": [], "manualQa": [], "next": []}
    license_path = AUTHORING_DIR / "input/asset-license.json"
    if license_path.is_file():
        ref = next((a for a in read_json(license_path).get("assets", []) if a.get("role") == "visual_reference"), {})
        report["rights"] = f"{ref.get('rightsHolder', '?')} 자산, 배포 {'가능' if ref.get('distributable') else '불가'}(앱 번들 제외)"
    else:
        report["rights"] = "asset-license.json 없음(확인 필요)"
    print(f"build {build_id} → {build_dir}")

    def plan_step():
        plan = load_plan(plan_path)
        return {"status": "READY", "layers": len(plan["layers"]), "groups": len(plan["groups"]),
                "required": sum(l["required"] for l in plan["layers"]), "_plan": plan}
    r = step(report, "plan", plan_step)
    plan = r.pop("_plan", None)
    if plan is None:
        report["status"] = "FAILED"
        report["next"].append("layer-plan.json 계약 위반을 고친 뒤 재실행")
        write_json(build_dir / "asset-build-report.json", report)
        (build_dir / "asset-build-report.md").write_text(report_md({"layers": []}, report), encoding="utf-8")
        return report

    has_src = src is not None and src.is_file()
    if has_src:
        from prepare_artwork import prepare
        from draft_split import split
        step(report, "prepare_artwork", lambda: prepare(src, plan, build_dir))
        report["files"] += ["source-info.json", "upper_body_preview.png"]
        draft_dir = build_dir / "layers-draft"
        dr = step(report, "draft_split", lambda: split(src, plan, draft_dir))
        report["files"].append("layers-draft/ (draft-split-report.json, *_REF.png, masks/)")
        report["manualQa"].append(f"초안 레이어 {len(dr.get('layers', []))}장은 색·ROI 추정치. 머리카락/눈/입 경계 수작업 분리 필요")
    else:
        report["steps"]["prepare_artwork"] = {"status": "BLOCKED_INPUT", "reason": f"원화 없음: {src}"}
        report["steps"]["draft_split"] = {"status": "BLOCKED_INPUT", "reason": "원화 없음"}
        draft_dir = None

    from validate_layers import validate
    from export_previews import export
    from assemble_psd import assemble
    vr = step(report, "validate_layers", lambda: validate(plan, layers_dir, False))
    write_json(build_dir / "layer-validation.json", vr)
    report["files"].append("layer-validation.json")
    real_ok = vr.get("status") in ("PASSED", "NEEDS_MANUAL_QA", "FAILED") and vr.get("layers")
    if vr.get("status") == "BLOCKED_INPUT":
        report["next"].append(f"실제 파츠 PNG 를 `{layers_dir}` 에 넣고 재실행(현재는 초안으로만 진행)")
    if draft_dir and draft_dir.is_dir():
        dv = step(report, "validate_drafts", lambda: validate(plan, draft_dir, True))
        write_json(build_dir / "draft-layer-validation.json", dv)
        report["files"].append("draft-layer-validation.json")

    use_dir, allow_draft = (layers_dir, False) if real_ok else (draft_dir, True)
    if use_dir:
        er = step(report, "export_previews", lambda: export(plan, use_dir, build_dir, allow_draft, src if has_src else None))
        report["files"] += er.get("files", [])
        pr = step(report, "assemble_psd", lambda: assemble(plan, use_dir, build_dir / "character_layers.psd", allow_draft))
        if pr.get("file"):
            report["files"].append("character_layers.psd (EXPERIMENTAL)")
            report["manualQa"].append("PSD 는 비Photoshop 작성(EXPERIMENTAL). Cubism Editor 임포트 후 레이어명·그룹·순서 확인")
    else:
        report["steps"]["export_previews"] = {"status": "BLOCKED_INPUT", "reason": "레이어/초안 없음"}
        report["steps"]["assemble_psd"] = {"status": "BLOCKED_INPUT", "reason": "레이어/초안 없음"}

    report["steps"]["cubism_rigging"] = {"status": "REQUIRES_EDITOR",
                                         "reason": "PSD 임포트·ArtMesh·파라미터·물리·moc3 내보내기는 Cubism Editor 에서 수동"}
    if model and model.is_file():
        from validate_export import validate as validate_model
        step(report, "validate_export", lambda: validate_model(model))
        write_json(build_dir / "model-export-validation.json", report["steps"]["validate_export"])
        report["files"].append("model-export-validation.json")
    else:
        report["steps"]["validate_export"] = {"status": "REQUIRES_EDITOR",
                                              "reason": "model3.json 없음. Cubism 에서 Export as MOC3 후 --model 로 전달"}
    report["next"].append("docs/cubism-import-checklist.md 절차대로 Cubism Editor 에서 리깅 후 validate_export.py 실행")

    (build_dir / "cubism-import-checklist.md").write_text(checklist_md(plan, report, build_dir), encoding="utf-8")
    report["files"] += ["cubism-import-checklist.md", "asset-build-report.md", "asset-build-report.json"]
    statuses = [r.get("status") for r in report["steps"].values()]
    report["status"] = "FAILED" if "FAILED" in statuses else ("NEEDS_MANUAL_QA" if "NEEDS_MANUAL_QA" in statuses
                                                              else "REQUIRES_EDITOR")
    (build_dir / "asset-build-report.md").write_text(report_md(plan, report), encoding="utf-8")
    write_json(build_dir / "asset-build-report.json", report)
    print(f"[{report['status']}] → {build_dir / 'asset-build-report.md'}")
    return report


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--build-id", required=True)
    ap.add_argument("--plan", type=Path, default=DEFAULT_PLAN)
    ap.add_argument("--input", type=Path, default=ROOT / "assets/reference/kiriko.png")
    ap.add_argument("--layers", type=Path, default=DEFAULT_LAYERS)
    ap.add_argument("--model", type=Path, help="*.model3.json (Cubism 내보내기 후)")
    ap.add_argument("--out-root", type=Path, default=DEFAULT_OUTPUT)
    args = ap.parse_args()
    report = run(args.build_id, args.plan, args.input, args.layers, args.model, args.out_root)
    sys.exit(1 if report["status"] == "FAILED" else 0)


if __name__ == "__main__":
    main()
