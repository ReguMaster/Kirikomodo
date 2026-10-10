import type { Emotion, Motion, TimeOfDay } from '@shared/types'

// FR-006 스크립트 대사 사전. 로직(ScriptedDialogueProvider)과 분리해 대사만 여기서 관리한다.
// 키리코 말투: 가볍고 친근한 반말, 과장 없는 응원.

export type Intent = 'greeting' | 'status' | 'work' | 'break' | 'goodnight' | 'thanks' | 'joke' | 'help' | 'unknown'
export const INTENTS: readonly Intent[] = ['greeting', 'status', 'work', 'break', 'goodnight', 'thanks', 'joke', 'help', 'unknown']

export interface ScriptLine {
  text: string
  emotion: Emotion
  motion?: Motion
}

// 공백을 제거한 소문자 문장에 순서대로 적용한다. 앞선 규칙이 우선이므로 구체적인 의도를 먼저 둔다.
export const INTENT_RULES: readonly { intent: Exclude<Intent, 'unknown'>; pattern: RegExp }[] = [
  { intent: 'goodnight', pattern: /잘자|굿나잇|굿밤|자러|잘게|졸려|졸리|취침|주무세요|자야/ },
  { intent: 'thanks', pattern: /고마|고맙|감사|땡큐|thank|thx/ },
  { intent: 'help', pattern: /도움|도와|help|뭘할수|뭐할수|할수있|기능|사용법|명령어|어떻게써|설명해/ },
  { intent: 'joke', pattern: /농담|개그|웃긴|웃겨|웃을|재밌는|재미있는|유머|드립/ },
  { intent: 'break', pattern: /쉬고|쉬자|쉴까|쉬어|쉬는|휴식|피곤|힘들|지쳤|지친|커피|산책|스트레칭|잠깐쉬/ },
  { intent: 'work', pattern: /공부|작업|업무|과제|코딩|회의|출근|야근|일하|일해|일할|일이많|집중|바빠|바쁘|마감|프로젝트/ },
  { intent: 'status', pattern: /뭐해|뭐하|잘지내|기분|어때|괜찮|심심|뭐함|잘있|컨디션/ },
  { intent: 'greeting', pattern: /안녕|하이|헬로|hello|^(hi|hey|yo)[!~.]*$|반가|왔어|왔다|좋은아침|굿모닝|ㅎㅇ|좋은저녁|다녀왔/ }
]

export const GREETING_LINES: Record<TimeOfDay, readonly ScriptLine[]> = {
  morning: [
    { text: '좋은 아침! 잘 잤어?', emotion: 'happy', motion: 'greet' },
    { text: '아침부터 반갑네. 오늘도 잘 부탁해!', emotion: 'happy', motion: 'wave' },
    { text: '일어났구나. 물 한 잔부터 마시자.', emotion: 'playful', motion: 'headTilt' }
  ],
  day: [
    { text: '안녕! 오늘 하루 어때?', emotion: 'happy', motion: 'greet' },
    { text: '왔구나! 기다리고 있었어.', emotion: 'playful', motion: 'wave' },
    { text: '안녕. 오늘도 같이 힘내 보자.', emotion: 'happy', motion: 'headTilt' }
  ],
  evening: [
    { text: '안녕, 벌써 저녁이네. 오늘 수고 많았어.', emotion: 'happy', motion: 'greet' },
    { text: '어서 와! 오늘은 어땠어?', emotion: 'curious', motion: 'wave' },
    { text: '저녁이다. 남은 일은 가볍게 마무리하자.', emotion: 'playful', motion: 'headTilt' }
  ],
  night: [
    { text: '늦은 시간인데 안녕! 무리하진 마.', emotion: 'concerned', motion: 'headTilt' },
    { text: '안녕... 나는 좀 졸리다. 너도 슬슬 쉬어.', emotion: 'sleepy', motion: 'yawn' },
    { text: '이 시간에도 깨어 있구나. 조용히 옆에 있을게.', emotion: 'sleepy', motion: 'wave' }
  ]
}

export const INTENT_LINES: Record<Exclude<Intent, 'greeting'>, readonly ScriptLine[]> = {
  status: [
    { text: '나야 늘 괜찮지! 너는 어때?', emotion: 'happy', motion: 'headTilt' },
    { text: '지금은 여기서 네 화면 구경 중이야. 꽤 재밌어.', emotion: 'playful', motion: 'look' },
    { text: '조금 심심했는데 네가 말 걸어줘서 좋다.', emotion: 'happy', motion: 'wave' },
    { text: '컨디션 최고! 오늘도 같이 힘내자.', emotion: 'happy', motion: 'greet' }
  ],
  work: [
    { text: '오, 일 모드구나. 방해 안 할 테니 집중해!', emotion: 'curious', motion: 'headTilt' },
    { text: '바쁠 땐 물 한 잔 챙기는 거 잊지 마.', emotion: 'concerned' },
    { text: '하나씩 끝내면 돼. 옆에서 응원할게.', emotion: 'happy', motion: 'wave' },
    { text: '마감이 가까우면 짧게 끊어서 가는 게 좋아. 파이팅!', emotion: 'playful', motion: 'greet' }
  ],
  break: [
    { text: '좋아, 잠깐 쉬자. 기지개 한 번!', emotion: 'happy', motion: 'stretch' },
    { text: '피곤할 땐 눈을 잠깐 감아도 좋아. 나는 여기 있을게.', emotion: 'concerned', motion: 'headTilt' },
    { text: '물 마시고, 창밖 한 번 보고. 그게 제일 빠른 회복이야.', emotion: 'curious', motion: 'look' },
    { text: '너무 무리하지 마. 쉬는 것도 실력이야.', emotion: 'concerned', motion: 'rest' }
  ],
  goodnight: [
    { text: '잘 자! 내일 또 보자.', emotion: 'happy', motion: 'wave' },
    { text: '오늘 하루도 고생했어. 좋은 꿈 꿔.', emotion: 'sleepy', motion: 'yawn' },
    { text: '불 끄고 폰은 내려놓기. 알지? 잘 자.', emotion: 'playful', motion: 'headTilt' },
    { text: '나도 슬슬 졸리네... 푹 쉬어.', emotion: 'sleepy', motion: 'rest' }
  ],
  thanks: [
    { text: '별말씀을! 이런 게 내 일이지.', emotion: 'happy', motion: 'greet' },
    { text: '에이, 뭘 이런 걸로. 또 불러.', emotion: 'playful', motion: 'wave' },
    { text: '고맙다니 나도 기분 좋다!', emotion: 'happy', motion: 'reactTap' }
  ],
  joke: [
    { text: '코딩하다 버그를 만나면? ...일단 인사부터 해. 오래 볼 사이니까.', emotion: 'playful', motion: 'headTilt' },
    { text: '내가 제일 잘하는 농담은 "곧 끝나"야. 늘 안 끝나거든.', emotion: 'playful', motion: 'wave' },
    { text: '농담 레퍼토리가 몇 개 없어. 그래도 웃어주면 하나 더 생각해 볼게!', emotion: 'happy', motion: 'look' }
  ],
  help: [
    { text: '지금은 규칙 기반이라 정해진 말만 알아들어. 인사, 안부, 일, 휴식, 잘 자, 고마워, 농담 정도!', emotion: 'curious', motion: 'headTilt' },
    { text: '아래 버튼을 눌러도 돼. 캐릭터를 클릭하거나 드래그해서 옮길 수도 있어.', emotion: 'happy', motion: 'wave' },
    { text: 'Ctrl + 마우스 휠로 내 크기를 바꿀 수 있고, 우클릭하면 메뉴가 나와.', emotion: 'playful', motion: 'look' }
  ],
  unknown: [
    { text: '그 말은 아직 잘 모르겠어. 다른 얘기 해볼까?', emotion: 'curious', motion: 'headTilt' },
    { text: '음... 그건 내가 아는 말이 아니야. "도움말"이라고 하면 뭘 알아듣는지 알려줄게.', emotion: 'concerned' },
    { text: '미안, 아직 그런 건 못 알아들어. 간단하게 다시 말해줄래?', emotion: 'concerned', motion: 'look' }
  ]
}

// 선제 발화(FR-005). 시간대별로 가벼운 한마디만 한다.
export const PROACTIVE_LINES: Record<TimeOfDay, readonly ScriptLine[]> = {
  morning: [
    { text: '좋은 아침! 오늘 계획은 세웠어?', emotion: 'happy', motion: 'wave' },
    { text: '아침 공기 좋다. 창문 한 번 열어볼래?', emotion: 'curious', motion: 'look' },
    { text: '기지개 한 번 하고 시작하자.', emotion: 'happy', motion: 'stretch' }
  ],
  day: [
    { text: '잘 되고 있어? 막히면 잠깐 쉬어도 돼.', emotion: 'curious', motion: 'headTilt' },
    { text: '물 마신 지 오래되지 않았어?', emotion: 'concerned', motion: 'look' },
    { text: '점심은 먹었어?', emotion: 'playful', motion: 'wave' }
  ],
  evening: [
    { text: '슬슬 저녁이네. 오늘 할 일은 거의 끝났어?', emotion: 'curious', motion: 'headTilt' },
    { text: '눈 좀 쉬게 해줘. 멀리 한 번 봐.', emotion: 'concerned', motion: 'look' },
    { text: '오늘도 수고했어.', emotion: 'happy', motion: 'wave' }
  ],
  night: [
    { text: '늦었다. 내일을 위해 슬슬 정리하는 건 어때?', emotion: 'sleepy', motion: 'yawn' },
    { text: '밤에는 화면 밝기를 조금 낮추는 게 좋아.', emotion: 'concerned', motion: 'headTilt' },
    { text: '나 먼저 좀 졸아도 되지...?', emotion: 'sleepy', motion: 'rest' }
  ]
}
