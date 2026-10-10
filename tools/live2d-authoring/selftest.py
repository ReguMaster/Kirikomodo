"""live2d-authoring 자체 검증(M-01~M-03·M-08). pytest 없이 assert 로만 동작한다.

    python tools/live2d-authoring/selftest.py

tests/fixtures/live2d 픽스처를 임시 폴더에서 돌려 각 CLI 의 상태값·산출물·실패 메시지를 확인한다.
원화(kiriko.png)는 쓰지 않으며, 실제 모델 완성 여부와 무관하다.
"""
from __future__ import annotations

import subprocess
import sys
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
FIX = ROOT / "tests/fixtures/live2d"
sys.path.insert(0, str(HERE))

from common import check_plan, load_plan, read_json  # noqa: E402


def cli(script: str, *args: str) -> subprocess.CompletedProcess:
    return subprocess.run([sys.executable, str(HERE / script), *args], capture_output=True, text=True,
                          encoding="utf-8", errors="replace")


def test_contract() -> None:
    plan = load_plan(FIX / "layer-plan.json")
    assert plan["model"]["name"] == "Fixture_Geo"
    assert not check_plan(load_plan(ROOT / "assets/live2d-authoring/input/layer-plan.json"))
    bad = read_json(FIX / "layer-plan.json")
    bad["layers"][1]["z"] = bad["layers"][2]["z"]
    bad["layers"][3]["id"] = "bad name"
    bad["layers"][4]["side"] = "R"
    bad["groups"].append("Bad Group")
    errs = check_plan(bad)
    assert any("z 중복" in e for e in errs) and any("규칙 위반" in e for e in errs) and any("_R 표기" in e for e in errs), errs


def test_help() -> None:
    for s in ("prepare_artwork", "draft_split", "validate_layers", "export_previews", "assemble_psd",
              "validate_export", "run_pipeline", "make_layer_plan", "make_fixtures"):
        r = cli(f"{s}.py", "--help")
        assert r.returncode == 0 and "usage" in r.stdout.lower(), (s, r.stderr)


def test_layers(tmp: Path) -> None:
    from validate_layers import validate
    from export_previews import export
    from assemble_psd import assemble
    plan = load_plan(FIX / "layer-plan.json")
    good = validate(plan, FIX / "layers", False)
    assert good["status"] == "PASSED" and good["errors"] == 0 and not good["missingRequired"], good
    assert len(good["layers"]) == 12
    bad = validate(plan, FIX / "layers-bad", False)
    assert bad["status"] == "FAILED"
    by_id = {l["id"]: l for l in bad["layers"]}
    assert any("빈 이미지" in e for e in by_id["Body"]["errors"])
    assert any("캔버스 크기" in e for e in by_id["Arm_L"]["errors"])
    assert any("가장자리" in w for w in by_id["Shadow_Adjust"]["warnings"])
    assert ["Eye_L_Iris", "Eye_R_Iris"] in bad["duplicates"]
    assert bad["unknownFiles"] == ["Unknown_Extra.png"]
    assert set(bad["missingRequired"]) == set()
    assert validate(plan, tmp / "nothing", False)["status"] == "BLOCKED_INPUT"
    assert validate(plan, FIX / "model", False)["status"] == "BLOCKED_INPUT"

    out = tmp / "preview"
    er = export(plan, FIX / "layers", out)
    assert er["status"] == "READY" and (out / "composite.png").is_file() and (out / "contact-sheet.png").is_file()
    from PIL import Image
    with Image.open(out / "composite.png") as im:
        assert im.size == (256, 320) and im.mode == "RGBA"
        assert im.getpixel((128, 10))[3] == 0, "Guide 레이어(_GUIDE)는 합성에서 제외돼야 함"
        assert im.getpixel((128, 110))[3] == 255
    assert export(plan, tmp / "nothing", out)["status"] == "BLOCKED_INPUT"

    psd = tmp / "psd/character_layers.psd"
    pr = assemble(plan, FIX / "layers", psd)
    assert pr["status"] == "NEEDS_MANUAL_QA" and pr["verify"] == [] and pr["experimental"], pr
    with Image.open(psd) as im:
        names = [l[0] for l in im.layers]
        assert im.size == (256, 320) and im.mode in ("RGB", "RGBA")
        assert "Fixture_Geo" in names and "Hair_Back" in names and "Eyes" in names and "Guide_Center_GUIDE" in names
        assert names.index("Hair_Back") < names.index("Hair_Front") < names.index("Arm_L"), names
    assert assemble(plan, tmp / "nothing", psd)["status"] == "BLOCKED_INPUT"


def test_export_validation(tmp: Path) -> None:
    from validate_export import validate
    ok = validate(FIX / "model/fixture.model3.json")
    assert ok["status"] == "PASSED" and ok["errors"] == [] and ok["motionGroups"] == ["Idle"], ok
    assert "EyeBlink" in ok["groups"] and ok["hitAreas"] == ["Head"]
    broken = validate(FIX / "model-broken/fixture.model3.json")
    assert broken["status"] == "FAILED"
    assert any("Moc 매직" in e for e in broken["errors"]) and any("texture_00.png" in e for e in broken["errors"]), broken
    r = cli("validate_export.py", "--model", str(tmp / "none.model3.json"), "--out", str(tmp))
    assert r.returncode == 2 and "BLOCKED_INPUT" in r.stdout, r.stdout


def test_pipeline(tmp: Path) -> None:
    r = cli("run_pipeline.py", "--build-id", "fx", "--plan", str(FIX / "layer-plan.json"), "--layers", str(FIX / "layers"),
            "--input", str(tmp / "no-source.png"), "--model", str(FIX / "model/fixture.model3.json"), "--out-root", str(tmp))
    assert r.returncode == 0, r.stdout + r.stderr
    rep = read_json(tmp / "fx/asset-build-report.json")
    s = {k: v["status"] for k, v in rep["steps"].items()}
    assert s == {"plan": "READY", "prepare_artwork": "BLOCKED_INPUT", "draft_split": "BLOCKED_INPUT",
                 "validate_layers": "PASSED", "export_previews": "READY", "assemble_psd": "NEEDS_MANUAL_QA",
                 "cubism_rigging": "REQUIRES_EDITOR", "validate_export": "PASSED"}, s
    assert rep["status"] == "NEEDS_MANUAL_QA"  # 실험적 PSD 단계가 돌면 항상 수동 QA
    for f in ("asset-build-report.md", "cubism-import-checklist.md", "layer-validation.json", "composite.png",
              "character_layers.psd", "model-export-validation.json"):
        assert (tmp / "fx" / f).is_file(), f
    md = (tmp / "fx/asset-build-report.md").read_text(encoding="utf-8")
    assert "REQUIRES_EDITOR" in md and "NEEDS_MANUAL_QA" in md and "완성" not in md, "모델 완성으로 오인될 문구 금지(M-08)"
    r = cli("run_pipeline.py", "--build-id", "fx-bad", "--plan", str(FIX / "layer-plan.json"),
            "--layers", str(FIX / "layers-bad"), "--input", str(tmp / "no-source.png"), "--out-root", str(tmp))
    assert r.returncode == 1 and read_json(tmp / "fx-bad/asset-build-report.json")["status"] == "FAILED"
    r = cli("prepare_artwork.py", "--input", str(tmp / "missing.png"), "--out", str(tmp / "p"))
    assert r.returncode == 2 and "BLOCKED_INPUT" in r.stderr, r.stderr


def test_clean_eyes() -> None:
    import numpy as np
    from clean_eyes import clean_variant
    skin = (250, 228, 220)
    layer = np.zeros((300, 300, 4), np.uint8)
    layer[100:170, 100:200] = (*skin, 255)
    layer[100:131, 100:200, :3] = (205, 198, 198)        # 윗눈꺼풀 위 회색 잔상
    layer[135:143, 120:180, :3] = (30, 12, 11)           # 속눈썹 호
    layer[270:280, 270:280] = (220, 160, 150, 255)       # 눈에서 먼 조각
    base_eye = np.zeros((300, 300), bool)
    base_eye[120:160, 110:190] = True
    out = clean_variant(layer, base_eye, skin)
    assert out[115, 150, 3] == 255 and np.abs(out[115, 150, :3].astype(int) - skin).max() < 12, out[115, 150]
    assert tuple(out[138, 150, :3]) == (30, 12, 11), "속눈썹 호는 그대로"
    assert out[275, 275, 3] == 0, "눈에서 먼 조각은 버려야 함"


def main() -> None:
    assert FIX.is_dir(), "먼저 python tools/live2d-authoring/make_fixtures.py 실행"
    with tempfile.TemporaryDirectory(prefix="kmd-live2d-") as td:
        tmp = Path(td)
        for name, fn in (("contract", test_contract), ("help", test_help), ("layers", lambda: test_layers(tmp)),
                         ("export_validation", lambda: test_export_validation(tmp)), ("clean_eyes", test_clean_eyes),
                         ("pipeline", lambda: test_pipeline(tmp))):
            fn()
            print(f"ok  {name}")
    print("selftest PASSED")


if __name__ == "__main__":
    main()
