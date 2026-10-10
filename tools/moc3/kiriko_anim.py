"""키리코 표정(exp3) 7종·모션(motion3) 10종·model-map.json. kiriko.py 가 moc3 와 함께 쓴다.

파라미터 규약은 kiriko.py: 눈 변형 가중치 ParamEyeHalf/Wide/Teary/Glare/Sleepy(0..1), 입 변형 가중치
ParamMouthO/Grin/Curious/Annoyed/Sleepy(0..1), ParamMouthForm(-1 Frown·0 Line·1 Smile), 감은 눈 = EyeOpen 0.
변형은 가중치라 일반 곡선으로 바꿔도 되고, 표정이 바뀔 때 기본 눈·입과 변형이 교차 페이드한다.
ParamArmR/L(소매 스윙, 어깨 피벗에서 바깥 +)은 idle·greet·wave·stretch·yawn·reactTap·rest 가 쓴다.
"""
from __future__ import annotations

import json
import math
import os

FPS = 30

# 앱 Emotion → exp3 파라미터 (blend: Overwrite 기본, 'add' 접두는 Add)
EXPRESSIONS: dict[str, dict[str, float]] = {
    'neutral': {},
    'happy': {'ParamEyeLOpen': 0, 'ParamEyeROpen': 0, 'ParamMouthForm': 1, 'add:ParamBrowLY': 0.3, 'add:ParamBrowRY': 0.3},
    'playful': {'ParamEyeROpen': 0, 'ParamMouthGrin': 1, 'add:ParamAngleZ': 8, 'add:ParamBrowRY': 0.3},
    'curious': {'ParamEyeWide': 1, 'ParamMouthCurious': 1, 'add:ParamBrowLY': 0.6, 'add:ParamBrowRY': 0.6, 'add:ParamAngleZ': -6},
    'concerned': {'ParamEyeTeary': 1, 'ParamMouthForm': -1, 'add:ParamBrowLY': -0.4, 'add:ParamBrowRY': -0.4, 'add:ParamAngleY': -4},
    'annoyed': {'ParamEyeGlare': 1, 'ParamMouthAnnoyed': 1, 'add:ParamBrowLY': -0.6, 'add:ParamBrowRY': -0.6},
    'sleepy': {'ParamEyeSleepy': 1, 'ParamMouthSleepy': 1, 'add:ParamAngleY': -6, 'add:ParamBodyAngleY': -3},
}


def exp3(params: dict[str, float]) -> dict:
    out = []
    for key, value in params.items():
        blend = 'Add' if key.startswith('add:') else 'Overwrite'
        out.append({'Id': key.split(':')[-1], 'Value': value, 'Blend': blend})
    return {'Type': 'Live2D Expression', 'FadeInTime': 0.3, 'FadeOutTime': 0.3, 'Parameters': out}


# ---- 모션 커브 ----
def smooth(keys: list[tuple[float, float]]) -> list[float]:
    """(t, v) 키를 ease-in-out 베지어 세그먼트로."""
    (t0, v0), *rest = keys
    seg = [t0, v0]
    for t1, v1 in rest:
        dt = (t1 - t0) / 3
        seg += [1, t0 + dt, v0, t1 - dt, v1, t1, v1]
        t0, v0 = t1, v1
    return seg


def wave(amp: float, period: float, duration: float, phase: float = 0.0, offset: float = 0.0, n: int = 8) -> list[tuple[float, float]]:
    steps = max(2, int(duration / period * n))
    return [(duration * i / steps, offset + amp * math.sin(2 * math.pi * (duration * i / steps) / period + phase)) for i in range(steps + 1)]


def motion3(duration: float, curves: dict[str, list[float]], loop: bool = False, fade_in: float = 0.5, fade_out: float = 0.5) -> dict:
    return {
        'Version': 3,
        'Meta': {'Duration': duration, 'Fps': FPS, 'Loop': loop, 'AreBeziersRestricted': True,
                 'FadeInTime': fade_in, 'FadeOutTime': fade_out, 'CurveCount': len(curves),
                 'TotalSegmentCount': sum((len(s) - 2) // 3 for s in curves.values()), 'TotalPointCount': sum(len(s) // 2 for s in curves.values())},
        'Curves': [{'Target': 'Parameter', 'Id': pid, 'Segments': seg} for pid, seg in curves.items()],
    }


def motions() -> dict[str, dict]:
    D = 6.0
    idle = motion3(D, {
        'ParamAngleX': smooth(wave(4, D, D)),
        'ParamAngleZ': smooth(wave(2, D, D, phase=1.2)),
        'ParamBodyAngleX': smooth(wave(2, D, D, phase=0.6)),
        'ParamHairBack': smooth(wave(0.35, D / 2, D)),
        'ParamHairSide': smooth(wave(0.25, D / 2, D, phase=0.8)),
        'ParamTassel': smooth(wave(0.3, D / 2, D, phase=1.5)),
        'ParamTail': smooth(wave(0.5, D, D, phase=0.3)),
        'ParamArmR': smooth(wave(0.12, D, D, phase=0.5)),
        'ParamArmL': smooth(wave(0.12, D, D, phase=2.0)),
        'ParamEarL': smooth([(0, 0), (2.0, 0), (2.15, 0.6), (2.4, 0), (D, 0)]),
        'ParamEarR': smooth([(0, 0), (4.1, 0), (4.25, 0.6), (4.5, 0), (D, 0)]),
    }, loop=True, fade_in=1.0)
    blink = motion3(0.3, {
        'ParamEyeLOpen': smooth([(0, 1), (0.1, 0), (0.3, 1)]),
        'ParamEyeROpen': smooth([(0, 1), (0.1, 0), (0.3, 1)]),
    }, fade_in=0, fade_out=0)
    look = motion3(1.6, {
        'ParamEyeBallX': smooth([(0, 0), (0.3, 0.9), (1.1, 0.9), (1.6, 0)]),
        'ParamEyeBallY': smooth([(0, 0), (0.3, 0.3), (1.1, 0.3), (1.6, 0)]),
        'ParamAngleX': smooth([(0, 0), (0.5, 12), (1.1, 12), (1.6, 0)]),
    }, fade_in=0.2)
    greet = motion3(2.6, {
        'ParamAngleY': smooth([(0, 0), (0.6, -22), (1.6, -22), (2.6, 0)]),
        'ParamBodyAngleY': smooth([(0, 0), (0.6, -6), (1.6, -6), (2.6, 0)]),
        'ParamEyeLOpen': smooth([(0, 1), (0.6, 0), (1.6, 0), (2.2, 1)]),
        'ParamEyeROpen': smooth([(0, 1), (0.6, 0), (1.6, 0), (2.2, 1)]),
        'ParamMouthForm': smooth([(0, 0), (0.4, 1), (2.2, 1), (2.6, 0)]),
        'ParamHairFront': smooth([(0, 0), (0.7, 0.8), (1.6, 0.3), (2.6, 0)]),
        'ParamTassel': smooth([(0, 0), (0.7, 0.9), (1.4, -0.3), (2.6, 0)]),
        'ParamArmR': smooth([(0, 0), (0.6, 0.5), (1.6, 0.5), (2.6, 0)]),
        'ParamArmL': smooth([(0, 0), (0.6, 0.5), (1.6, 0.5), (2.6, 0)]),
    })
    wv = motion3(2.4, {
        'ParamSleeve': smooth(wave(1.0, 0.6, 2.4)),
        'ParamArmR': smooth(wave(0.35, 0.6, 2.4, offset=0.65)),   # 소매를 0.3~1.0 로 흔든다
        'ParamBodyAngleZ': smooth(wave(4, 1.2, 2.4)),
        'ParamAngleZ': smooth([(0, 0), (0.4, 8), (2.0, 8), (2.4, 0)]),
        'ParamMouthForm': smooth([(0, 0), (0.3, 1), (2.1, 1), (2.4, 0)]),
        'ParamTail': smooth(wave(1.0, 0.8, 2.4)),
    })
    head_tilt = motion3(2.2, {
        'ParamAngleZ': smooth([(0, 0), (0.5, 14), (1.7, 14), (2.2, 0)]),
        'ParamEyeBallX': smooth([(0, 0), (0.5, 0.3), (1.7, 0.3), (2.2, 0)]),
        'ParamEarR': smooth([(0, 0), (0.5, 0.7), (1.7, 0.7), (2.2, 0)]),
        'ParamHairSide': smooth([(0, 0), (0.6, 0.6), (1.7, 0.4), (2.2, 0)]),
        'ParamBrowLY': smooth([(0, 0), (0.5, 0.5), (1.7, 0.5), (2.2, 0)]),
        'ParamBrowRY': smooth([(0, 0), (0.5, 0.5), (1.7, 0.5), (2.2, 0)]),
    })
    stretch = motion3(3.0, {
        'ParamAngleY': smooth([(0, 0), (0.8, 16), (2.0, 16), (3.0, 0)]),
        'ParamBodyAngleY': smooth([(0, 0), (0.8, 8), (2.0, 8), (3.0, 0)]),
        'ParamBreath': smooth([(0, 0), (0.8, 1), (2.0, 1), (3.0, 0)]),
        'ParamEyeLOpen': smooth([(0, 1), (0.8, 0), (2.0, 0), (2.6, 1)]),
        'ParamEyeROpen': smooth([(0, 1), (0.8, 0), (2.0, 0), (2.6, 1)]),
        'ParamMouthO': smooth([(0, 0), (0.6, 1), (2.0, 1), (2.5, 0)]),
        'ParamSleeve': smooth([(0, 0), (0.8, -0.8), (2.0, -0.8), (3.0, 0)]),
        'ParamArmR': smooth([(0, 0), (0.8, 1.0), (2.0, 1.0), (3.0, 0)]),
        'ParamArmL': smooth([(0, 0), (0.8, 1.0), (2.0, 1.0), (3.0, 0)]),
    }, fade_in=0)
    yawn = motion3(3.2, {
        'ParamEyeSleepy': smooth([(0, 0), (0.5, 1), (2.6, 1), (3.0, 0)]),
        'ParamMouthSleepy': smooth([(0, 0), (0.7, 1), (2.4, 1), (2.9, 0)]),
        'ParamAngleY': smooth([(0, 0), (1.0, 10), (2.2, 10), (3.2, 0)]),
        'ParamBrowLY': smooth([(0, 0), (1.0, 0.5), (2.2, 0.5), (3.2, 0)]),
        'ParamBrowRY': smooth([(0, 0), (1.0, 0.5), (2.2, 0.5), (3.2, 0)]),
        'ParamEarL': smooth([(0, 0), (1.0, -0.6), (2.2, -0.6), (3.2, 0)]),
        'ParamEarR': smooth([(0, 0), (1.0, -0.6), (2.2, -0.6), (3.2, 0)]),
        'ParamArmR': smooth([(0, 0), (1.0, 0.5), (2.2, 0.5), (3.2, 0)]),
        'ParamArmL': smooth([(0, 0), (1.0, 0.5), (2.2, 0.5), (3.2, 0)]),
    }, fade_in=0)
    react_tap = motion3(1.4, {
        'ParamEyeWide': smooth([(0, 1), (0.7, 1), (1.1, 0)]),
        'ParamMouthO': smooth([(0, 1), (0.6, 1), (1.0, 0)]),
        'ParamAngleY': smooth([(0, 0), (0.15, 10), (0.9, 6), (1.4, 0)]),
        'ParamBodyAngleY': smooth([(0, 0), (0.15, 4), (1.4, 0)]),
        'ParamEarL': smooth([(0, 0), (0.15, 1), (1.0, 1), (1.4, 0)]),
        'ParamEarR': smooth([(0, 0), (0.15, 1), (1.0, 1), (1.4, 0)]),
        'ParamTail': smooth([(0, 0), (0.2, 1), (0.6, -0.6), (1.0, 0.3), (1.4, 0)]),
        'ParamTassel': smooth([(0, 0), (0.2, 1), (0.6, -0.7), (1.0, 0.3), (1.4, 0)]),
        'ParamArmR': smooth([(0, 0), (0.15, 0.7), (0.6, -0.2), (1.4, 0)]),
        'ParamArmL': smooth([(0, 0), (0.15, 0.7), (0.6, -0.2), (1.4, 0)]),
    }, fade_in=0, fade_out=0.3)
    R = 5.0
    rest = motion3(R, {
        'ParamEyeLOpen': smooth([(0, 1), (1.0, 0), (R, 0)]),
        'ParamEyeROpen': smooth([(0, 1), (1.0, 0), (R, 0)]),
        'ParamAngleY': smooth([(0, 0), (1.5, -12), (R, -12)]),
        'ParamBodyAngleY': smooth([(0, 0), (1.5, -4), (R, -4)]),
        'ParamAngleZ': smooth(wave(3, R, R)),
        'ParamEarL': smooth([(0, 0), (1.5, -0.5), (R, -0.5)]),
        'ParamEarR': smooth([(0, 0), (1.5, -0.5), (R, -0.5)]),
        'ParamArmR': smooth([(0, 0), (1.5, -0.4), (R, -0.4)]),
        'ParamArmL': smooth([(0, 0), (1.5, -0.4), (R, -0.4)]),
    }, loop=True, fade_in=1.0)
    return {'idle': idle, 'blink': blink, 'look': look, 'greet': greet, 'wave': wv, 'headTilt': head_tilt,
            'stretch': stretch, 'yawn': yawn, 'reactTap': react_tap, 'rest': rest}


GROUP = {'idle': 'Idle', 'blink': 'Blink', 'look': 'Look', 'greet': 'Greet', 'wave': 'Wave', 'headTilt': 'HeadTilt',
         'stretch': 'Stretch', 'yawn': 'Yawn', 'reactTap': 'ReactTap', 'rest': 'Rest'}


def write_all(out_dir: str) -> tuple[dict, list]:
    """exp3·motion3·model-map.json 을 쓰고 model3 의 (Motions, Expressions) 를 돌려준다."""
    os.makedirs(os.path.join(out_dir, 'expressions'), exist_ok=True)
    os.makedirs(os.path.join(out_dir, 'motions'), exist_ok=True)
    dump = lambda rel, data: json.dump(data, open(os.path.join(out_dir, rel), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    expressions = []
    for name, params in EXPRESSIONS.items():
        rel = f'expressions/{name}.exp3.json'
        dump(rel, exp3(params))
        expressions.append({'Name': name, 'File': rel})
    motion_refs = {}
    for name, data in motions().items():
        rel = f'motions/{name}.motion3.json'
        dump(rel, data)
        motion_refs[GROUP[name]] = [{'File': rel}]
    dump('model-map.json', {'motions': GROUP, 'emotions': {name: name for name in EXPRESSIONS}})
    return motion_refs, expressions
