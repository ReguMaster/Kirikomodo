"""키리코 physics3.json. kiriko.py 가 moc3 와 함께 쓴다.

입력은 고개(ParamAngleX·AngleZ)·몸(ParamBodyAngleX), 출력은 kiriko.py 의 흔들림 파라미터(-1..1).
시뮬은 공식 CubismPhysics 와 같은 진자(앱 src/character/live2dPhysics.ts). 출력 각은 라디안이라 Scale 로 -1..1 에 맞춘다.
"""
from __future__ import annotations

import json
import os

# id: (출력 파라미터, 꼭짓점 반지름 목록, 흔들림 지연(Delay), 출력 Scale, 입력 X 가중치, 입력 Angle 가중치)
STRANDS: dict[str, tuple[str, list[float], float, float, float, float]] = {
    'HairFront': ('ParamHairFront', [6, 6], 0.9, 6.0, 40, 40),
    'HairSide': ('ParamHairSide', [8, 8, 8], 0.85, 5.0, 60, 60),
    'HairBack': ('ParamHairBack', [10, 10, 10], 0.8, 4.0, 70, 70),
    'Tassel': ('ParamTassel', [6, 6, 6], 0.75, 4.0, 80, 80),
    'Ofuda': ('ParamOfuda', [8, 8], 0.8, 4.5, 60, 60),
    'Ribbon': ('ParamRibbon', [6, 6], 0.85, 5.0, 50, 30),
    'Sleeve': ('ParamSleeve', [10, 10], 0.9, 5.0, 50, 20),
    'Skirt': ('ParamSkirt', [12, 12], 0.9, 4.5, 60, 20),
    'Tail': ('ParamTail', [14, 14, 14], 0.7, 3.5, 60, 40),
    'EarR': ('ParamEarR', [6, 6], 0.9, 6.0, 30, 50),
    'EarL': ('ParamEarL', [6, 6], 0.9, 6.0, 30, 50),
}
BODY_DRIVEN = {'Ribbon', 'Sleeve', 'Skirt', 'Tail'}


def setting(sid: str, pid: str, radii: list[float], delay: float, scale: float, wx: float, wa: float) -> dict:
    body = sid in BODY_DRIVEN
    inputs = [
        {'Source': {'Target': 'Parameter', 'Id': 'ParamBodyAngleX' if body else 'ParamAngleX'}, 'Weight': wx, 'Type': 'X', 'Reflect': False},
        {'Source': {'Target': 'Parameter', 'Id': 'ParamAngleZ'}, 'Weight': wa, 'Type': 'Angle', 'Reflect': False},
    ]
    if body:
        inputs.append({'Source': {'Target': 'Parameter', 'Id': 'ParamAngleX'}, 'Weight': 30, 'Type': 'X', 'Reflect': False})
    vertices = [{'Position': {'X': 0, 'Y': 0}, 'Mobility': 1, 'Delay': 1, 'Acceleration': 1, 'Radius': 0}]
    y = 0.0
    for i, r in enumerate(radii):
        y += r
        vertices.append({'Position': {'X': 0, 'Y': y}, 'Mobility': 0.95 - 0.05 * i, 'Delay': delay, 'Acceleration': 1.5, 'Radius': r})
    return {
        'Id': 'PhysicsSetting_' + sid,
        'Input': inputs,
        'Output': [{'Destination': {'Target': 'Parameter', 'Id': pid}, 'VertexIndex': len(radii), 'Scale': scale, 'Weight': 100, 'Type': 'Angle', 'Reflect': False}],
        'Vertices': vertices,
        'Normalization': {'Position': {'Minimum': -10, 'Default': 0, 'Maximum': 10}, 'Angle': {'Minimum': -10, 'Default': 0, 'Maximum': 10}},
    }


def physics3() -> dict:
    settings = [setting(sid, *spec) for sid, spec in STRANDS.items()]
    return {
        'Version': 3,
        'Meta': {
            'PhysicsSettingCount': len(settings),
            'TotalInputCount': sum(len(s['Input']) for s in settings),
            'TotalOutputCount': sum(len(s['Output']) for s in settings),
            'VertexCount': sum(len(s['Vertices']) for s in settings),
            'EffectiveForces': {'Gravity': {'X': 0, 'Y': -1}, 'Wind': {'X': 0, 'Y': 0}},
            'PhysicsDictionary': [{'Id': s['Id'], 'Name': s['Id'].split('_', 1)[1]} for s in settings],
        },
        'PhysicsSettings': settings,
    }


def write(out_dir: str) -> str:
    name = 'kiriko.physics3.json'
    with open(os.path.join(out_dir, name), 'w', encoding='utf-8') as f:
        json.dump(physics3(), f, ensure_ascii=False, indent=2)
    return name
