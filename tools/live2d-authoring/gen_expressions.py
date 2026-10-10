"""제작 기준 원본의 얼굴 영역을 인페인팅해 눈 감음·입 모양·눈썹·표정 변형을 같은 화풍으로 만든다.

    .venv/Scripts/python tools/live2d-authoring/gen_expressions.py gen [--only closed,half] [--seeds 7,8,9]
    .venv/Scripts/python tools/live2d-authoring/gen_expressions.py pick closed=8 mouth_open=7 ...
    .venv/Scripts/python tools/live2d-authoring/gen_expressions.py sheet

- 모델: Animagine XL 3.1(단일 safetensors) + sdxl-vae-fp16-fix. HF 캐시는 저장소 안 output/hf-cache (Git 무시).
- 원본 얼굴 주변 FACE 박스(640px)를 1024 로 올려 눈 또는 입만 마스크(가장자리 흐림)하고 다시 그린 뒤 640 으로 내린다.
- 한 번에 한 영역만 칠한다(눈+입 동시는 깨짐). 복합 표정은 `base` 로 앞 변형의 채택본 위에 입을 덧칠한다.
- 눈은 왼눈만 칠하고 오른눈은 얼굴 중심축으로 미러(`mirror=True`). 양눈을 따로 칠하면 높이·형태가 어긋났다. wink 는 미러 없이 왼눈만.
- 눈 상자 위쪽 앞머리가 회색으로 탈색되는 건 무시한다(앞머리 레이어는 base 에서 따로 잘라 눈 위에 덮는다).
- `brows`(눈썹)는 세 시드 모두 실패(앞머리를 지우고 이마를 새로 그려 버림) → 눈썹은 TASKS 5 에서 가는 호로 직접 그린다.
- gen: output/expressions/cand/<name>.s<seed>.png + <name>.candidates.png (Read 로 고른다)
  pick: 채택본을 <name>.png / <name>.full.png(원본 전체에 되붙인 RGBA) 로 복사, picks.json 기록
  sheet: contact.png (base + 채택본 전부)
"""
from __future__ import annotations

import argparse
import json
import os
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
os.environ.setdefault('HF_HOME', str(ROOT / 'assets/live2d-authoring/output/hf-cache'))

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

BASE = ROOT / 'assets/reference/private/kiriko-base-prepared.png'
OUT = ROOT / 'assets/live2d-authoring/output/expressions'
CAND = OUT / 'cand'
FACE = (970, 560, 1610, 1200)  # 원본 좌표, 640x640: 눈 y≈850, 입 y≈950, 얼굴 중심 x≈1290
GEN = 1024
REGION = {  # 원본 좌표
    'eye_l': (1095, 800, 1265, 912),  # 위 25px 내림(앞머리 탈색 띠). 오른눈은 미러라 볼 쐐기 잔상 없음
    'eye_r': (1330, 800, 1500, 912),
    'brows': (1080, 720, 1500, 830),
    'mouth': (1240, 915, 1400, 1015),  # 위는 코점 아래, 오른쪽은 턱선 복제 잔상 방지
}
AXIS = 1297.5  # 얼굴 좌우 대칭축(원본 x). eye_l 을 비추면 eye_r
EYES = ['eye_l']  # 왼눈만 칠하고 오른눈은 미러(좌우 높이·형태 불일치 방지)
FEATHER = 20  # 마스크 가장자리 흐림(GEN 픽셀). 사각 경계 솔기 방지
STYLE = ('1girl, solo, light pink hair, long hair, fox ears, white kimono, miko, '
         'upper body, anime coloring, soft shading, clean lineart, '
         'masterpiece, best quality, very aesthetic, absurdres')
NEG = ('lowres, bad anatomy, bad hands, text, error, missing fingers, extra digit, fewer digits, cropped, '
       'worst quality, low quality, normal quality, jpeg artifacts, signature, watermark, username, blurry, '
       'realistic, 3d, photo, deformed eyes, asymmetric eyes, grey hair, gray hair')
CLOSED_NEG = 'open eyes, half-closed eyes, iris, pupil, red eyes, eyelid, looking at viewer'
EYE_NEG = 'white bar highlight, round cartoon eyes, different eye shape, grey eyebrows, hair over eye'
V = lambda regions, prompt, neg='', base=None, mirror=False: dict(regions=regions, prompt=prompt, neg=neg, base=base, mirror=mirror)
VARIANTS = {
    'closed': V(EYES, 'closed eyes, eyes closed, ^ ^, closed eyelids, gentle smile', CLOSED_NEG, mirror=True),
    'half': V(EYES, 'red eyes, half-closed eyes, sleepy, drowsy, droopy eyelids, jitome, looking at viewer, same eye shape as the other eye', EYE_NEG, mirror=True),
    'wink': V(EYES, 'closed eyes, eyes closed, ^ ^, closed eyelids, gentle smile', CLOSED_NEG),  # 왼눈만 칠하고 미러 안 함 = 윙크
    'wide': V(EYES, 'red eyes, surprised, wide eyes, raised eyebrows, looking at viewer, single round highlight', EYE_NEG, mirror=True),
    'teary': V(EYES, 'red eyes, same eye shape, single round highlight, tearful eyes, tears welling up at lower eyelid, worried eyebrows, looking at viewer', EYE_NEG, mirror=True),
    'glare': V(EYES, 'red eyes, angry, annoyed, furrowed brow, narrowed eyes, v-shaped eyebrows, looking at viewer, single round highlight', EYE_NEG, mirror=True),
    'mouth_open': V(['mouth'], 'open mouth, talking, teeth, visible tongue tip'),
    'mouth_o': V(['mouth'], 'open mouth, :o, small round mouth, surprised'),
    'brows': V(['brows'], 'forehead visible, hair pulled back, thin pink eyebrows, neutral expression'),
    # 복합 표정(앱 Emotion): 눈 변형 채택본 위에 입만 덧칠
    'happy': V(['mouth'], 'happy, open mouth smile, laughing, blush', base='closed'),
    'playful': V(['mouth'], 'playful, smirk, tongue out, :p', base='wink'),
    'curious': V(['mouth'], 'open mouth, :o, small round mouth, surprised', base='wide'),
    'concerned': V(['mouth'], 'sad, worried, frown, wavy mouth, :<', base='teary'),
    'annoyed': V(['mouth'], 'angry, annoyed, pout, frown, >:(', base='glare'),
    'sleepy': V(['mouth'], 'sleepy, yawning, open mouth, drowsy', base='half'),
}


def face_rgb(img: Image.Image) -> Image.Image:
    crop = img.crop(FACE)
    return Image.alpha_composite(Image.new('RGBA', crop.size, (255, 255, 255, 255)), crop).convert('RGB')


def load_pipe():
    import torch
    from diffusers import AutoencoderKL, StableDiffusionXLInpaintPipeline
    from huggingface_hub import hf_hub_download
    ckpt = hf_hub_download('cagliostrolab/animagine-xl-3.1', 'animagine-xl-3.1.safetensors')
    vae = AutoencoderKL.from_pretrained('madebyollin/sdxl-vae-fp16-fix', torch_dtype=torch.float16)
    pipe = StableDiffusionXLInpaintPipeline.from_single_file(ckpt, vae=vae, torch_dtype=torch.float16)
    pipe.enable_model_cpu_offload()  # ponytail: 8GB VRAM 안전 우선. 느리면 .to('cuda') 로
    pipe.vae.enable_slicing()
    return pipe


def region_mask(regions: list[str], size: int) -> Image.Image:
    scale = size / (FACE[2] - FACE[0])
    mask = Image.new('L', (size, size), 0)
    d = ImageDraw.Draw(mask)
    for r in regions:
        x0, y0, x1, y1 = REGION[r]
        d.rectangle(((x0 - FACE[0]) * scale, (y0 - FACE[1]) * scale, (x1 - FACE[0]) * scale, (y1 - FACE[1]) * scale), fill=255)
    return mask.filter(ImageFilter.GaussianBlur(FEATHER * scale))


def blend(a: Image.Image, b: Image.Image, mask: Image.Image) -> Image.Image:
    """mask 가 255 인 곳은 a, 0 인 곳은 b."""
    m = np.asarray(mask).astype(np.float32)[..., None] / 255
    return Image.fromarray((np.asarray(a).astype(np.float32) * m + np.asarray(b).astype(np.float32) * (1 - m)).round().astype(np.uint8))


def mirror_eye(img: Image.Image) -> Image.Image:
    """eye_l 상자 내용을 대칭축으로 비춰 eye_r 상자에 덮는다."""
    w = img.width
    axis = AXIS - FACE[0]
    flipped = img.transpose(Image.FLIP_LEFT_RIGHT)  # x' = w-1-x
    shift = int(round(2 * axis - (w - 1)))  # x' = 2·axis - x
    shifted = Image.new('RGB', img.size)
    shifted.paste(flipped, (shift, 0))
    return blend(shifted, img, region_mask(['eye_r'], w))


def gen(names: list[str], seeds: list[int], steps: int, cfg: float) -> None:
    import torch
    CAND.mkdir(parents=True, exist_ok=True)
    base_rgb = face_rgb(Image.open(BASE).convert('RGBA'))
    pipe = load_pipe()
    for name in names:
        v = VARIANTS[name]
        src = base_rgb if v['base'] is None else Image.open(OUT / f"{v['base']}.png").convert('RGB')
        src_gen = src.resize((GEN, GEN), Image.LANCZOS)
        mask = region_mask(v['regions'], GEN)
        m = mask.resize(src.size, Image.BILINEAR)
        tiles = []
        for seed in seeds:
            g = torch.Generator('cuda').manual_seed(seed)
            img = pipe(prompt=f"{v['prompt']}, {STYLE}", negative_prompt=f"{v['neg']}, {NEG}", image=src_gen, mask_image=mask,
                       strength=1.0, num_inference_steps=steps, guidance_scale=cfg, width=GEN, height=GEN, generator=g).images[0]
            merged = blend(img.resize(src.size, Image.LANCZOS), src, m)
            if v['mirror']:
                merged = mirror_eye(merged)
            merged.save(CAND / f'{name}.s{seed}.png')
            tiles.append((seed, merged))
            print('done', name, seed, flush=True)
        sheet = Image.new('RGB', (len(tiles) * 400, 420), (40, 40, 40))
        for i, (seed, t) in enumerate(tiles):
            sheet.paste(t.resize((400, 400), Image.LANCZOS), (i * 400, 0))
            ImageDraw.Draw(sheet).text((i * 400 + 6, 402), f'{name} s{seed}', fill=(255, 255, 255))
        sheet.save(OUT / f'{name}.candidates.png')


def pick(pairs: list[str]) -> None:
    picks_path = OUT / 'picks.json'
    picks = json.loads(picks_path.read_text(encoding='utf-8')).get('picks', {}) if picks_path.exists() else {}
    base = Image.open(BASE).convert('RGBA')
    for pair in pairs:
        name, seed = pair.split('=')
        shutil.copyfile(CAND / f'{name}.s{seed}.png', OUT / f'{name}.png')
        full = base.copy()
        patch = np.asarray(full.crop(FACE)).copy()
        patch[..., :3] = np.asarray(Image.open(OUT / f'{name}.png').convert('RGB'))
        full.paste(Image.fromarray(patch), FACE[:2])
        full.save(OUT / f'{name}.full.png')
        picks[name] = int(seed)
    picks_path.write_text(json.dumps({'face': FACE, 'regions': REGION, 'picks': picks}, ensure_ascii=False, indent=2), encoding='utf-8')


def sheet() -> None:
    names = [n for n in VARIANTS if (OUT / f'{n}.png').exists()]
    tiles = [('base', face_rgb(Image.open(BASE).convert('RGBA')))] + [(n, Image.open(OUT / f'{n}.png')) for n in names]
    cols = 4
    rows = (len(tiles) + cols - 1) // cols
    out = Image.new('RGB', (cols * 400, rows * 420), (40, 40, 40))
    for i, (n, t) in enumerate(tiles):
        out.paste(t.resize((400, 400), Image.LANCZOS), ((i % cols) * 400, (i // cols) * 420))
        ImageDraw.Draw(out).text(((i % cols) * 400 + 6, (i // cols) * 420 + 402), n, fill=(255, 255, 255))
    out.save(OUT / 'contact.png')


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument('cmd', choices=['gen', 'pick', 'sheet'])
    ap.add_argument('pairs', nargs='*', help='pick: name=seed ...')
    ap.add_argument('--only', default='')
    ap.add_argument('--seeds', default='7,8,9')
    ap.add_argument('--steps', type=int, default=28)
    ap.add_argument('--cfg', type=float, default=6.5)
    args = ap.parse_args()
    OUT.mkdir(parents=True, exist_ok=True)
    if args.cmd == 'gen':
        names = [n for n in args.only.split(',') if n] or list(VARIANTS)
        gen(names, [int(s) for s in args.seeds.split(',')], args.steps, args.cfg)
    elif args.cmd == 'pick':
        pick(args.pairs)
    else:
        sheet()


if __name__ == '__main__':
    main()
