// What the person sends to the AI they use most to bring what it remembers about them, the way
// Claude's memory import works: copy this into a chat with that AI, paste its answer back. Unlike
// Claude's, it asks only for what stays true (rules, corrections, how they work and talk) and asks
// the other AI to leave out what changes or is private, so less is pasted and nothing stale is kept.

export const EXPORT_PROMPT = {
  en: `Export the memories you have stored about me and what you have learned about me in past conversations, keeping only what will still be true months from now. Preserve my words verbatim where possible, especially for instructions and preferences.

## Categories (in this order)
1. Instructions: rules I asked you to follow going forward — tone, format, style, "always do X", "never do Y", and corrections I made to your behavior.
2. Working style: how I decide, what I look at first, what I dislike, and what I want to be asked before you act.
3. Communication: the languages I use, my tone, and expressions I often use.

## Leave out
Anything that changes: projects, plans, goals, dates, and current status. Anything private: my name, age, location, family, health and money, passwords and keys, and other people's private matters.

## Output
- A header for each category, one entry per line.
- Wrap the entire export in a single code block for easy copying.
- After the code block, say whether this is the complete set or more remain.`,
  ko: `지금까지 저장한 내 메모리와 지난 대화에서 알게 된 나에 대한 것 중에서, 몇 달 뒤에도 그대로일 것만 내보내 줘. 내가 한 말은 가능한 한 그대로 옮겨 줘. 특히 지시와 선호는.

## 항목 (이 순서로)
1. 지시: 앞으로 지키라고 내가 말한 규칙. 말투, 형식, 스타일, "항상 이렇게", "절대 이렇게", 내가 고쳐 준 것.
2. 일하는 방식: 어떻게 정하는지, 무엇을 먼저 보는지, 무엇을 싫어하는지, 하기 전에 먼저 물어봐야 하는 일.
3. 말하는 방식: 쓰는 언어, 말투, 자주 쓰는 표현.

## 빼 줘
바뀌는 것: 프로젝트, 계획, 목표, 날짜, 지금 상황. 사적인 것: 이름, 나이, 사는 곳, 가족, 건강, 돈, 비밀번호와 키, 다른 사람의 사적인 일.

## 출력
- 항목마다 제목을 달고, 한 줄에 하나씩.
- 쉽게 복사하도록 전체를 코드 블록 하나에 넣어 줘.
- 코드 블록 뒤에, 이게 전부인지 더 남았는지 말해 줘.`,
} as const;
