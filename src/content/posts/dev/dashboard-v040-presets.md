---
title: "Claude Dashboard v0.4.0 — 세션 프리셋과 3-tier Fallback"
description: "여러 세션을 구분하기 위한 이름/색상 시스템, 대시보드 연동, 그리고 컨텍스트 압축에도 살아남는 3-tier fallback 설계"
category: "dev"
pubDate: "2026-03-18T01:20:00.000Z"
tags: ["claude-code", "typescript", "fastify", "macos", "process-detection", "statusline"]
draft: false
---

[지난 글](/posts/dev/claude-dashboard)에서 Claude Multiple Dashboard의 v0.3.0까지 만든 이야기를 했다. 오늘은 v0.4.0에서 가장 체감이 컸던 기능 — 세션 이름/색상 시스템과 그 자동화 과정을 정리한다.

## 문제: 세션이 3개만 되어도 헷갈린다

Claude Code를 병렬로 쓰다 보면 터미널 탭이 3~5개 열린다. 대시보드도, 가계부도, 습관 트래커도 전부 "claude"라는 이름으로 돌아가고 있다. 어느 탭이 어떤 프로젝트인지 매번 들어가서 확인해야 했다.

![분할 전 — 세션 구분이 안 되는 상태](/images/posts/dashboard-v040/light-overview.png)

## 해결 1단계: 터미널에 이름 붙이기

먼저 Claude Code의 **statusline** 기능을 활용했다. Claude Code는 하단에 모델명, 컨텍스트 사용률 등을 표시하는 상태 줄을 커스텀할 수 있다. 여기에 세션 이름과 색상을 넣었다.

`/session-setting`이라는 스킬을 만들어서:

```bash
/session-setting name:대시보드 color:red
/session-setting name:가계부 color:blue
/session-setting name:습관관리 color:green
```

이렇게 치면 터미널 하단에 `[대시보드]`, `[가계부]`처럼 색상 라벨이 붙는다. 이것만으로도 탭 전환할 때 어디가 어딘지 바로 보인다.

![터미널에 이름/색상이 적용된 모습](/images/posts/dashboard-v040/terminal-sessions.png)

## 해결 2단계: 대시보드에도 동일하게 적용

터미널에서 이름을 붙이는 건 좋은데, 대시보드에서는 여전히 기본 프로젝트명만 보인다. `/session-setting`으로 설정한 이름과 색상이 대시보드 세션 카드에도 그대로 반영되게 하고 싶었다.

이를 위해 스킬이 실행될 때 두 가지를 동시에 업데이트하도록 만들었다:

1. `/tmp` 파일에 저장 → statusline이 읽어서 터미널에 표시
2. `~/.claude-dashboard/sessions/{id}.json`을 원자적으로 수정 → 대시보드에 반영

대시보드 쪽에서는 Session 타입에 `color` 필드를 추가하고, CSS `data-color` attribute로 세션 카드에 색상 틴트를 입혔다. 왼쪽에 3px 컬러 바 + 배경에 8% 투명도 색상. 다크/라이트 테마 모두 자연스럽게 보인다.

![대시보드에 세션 색상이 적용된 모습](/images/posts/dashboard-v040/session-colors.png)

## 해결 3단계: 매번 치기 귀찮다 — 프리셋 자동화

문제가 하나 남았다. 세션을 열 때마다 `/session-setting`을 쳐야 한다는 것. 같은 프로젝트에서 매번 같은 이름/색상을 쓰는데.

`--save` 플래그를 추가했다:

```bash
/session-setting name:대시보드 color:red --save
```

이러면 현재 디렉토리를 `config.json`의 `sessionDefaults`에 저장한다. 다음에 같은 디렉토리에서 세션이 시작되면 서버가 자동으로 이름/색상을 적용한다.

```json
{
  "sessionDefaults": {
    "/Users/me/dashboard": { "name": "대시보드", "color": "red" },
    "/Users/me/cloudpocket": { "name": "가계부", "color": "blue" }
  }
}
```

단, 홈 디렉토리(`~/`)같은 범용 경로는 매칭에서 제외한다. 여러 세션이 같은 `~/`에서 열릴 수 있기 때문이다.

## 3-tier Fallback: 컨텍스트 압축에도 살아남기

Claude Code는 대화가 길어지면 컨텍스트를 자동 압축한다. 이때 `/tmp` 파일이 유실될 수 있다. 세션 이름이 갑자기 사라지는 문제를 해결하기 위해 3단계 fallback을 설계했다.

```
statusline.sh 실행
  ├─ Tier 1: /tmp/claude-sessions/{id}.name  ← 빠름 (정상 시)
  ├─ Tier 2: ~/.claude-dashboard/sessions/{id}.json  ← 영구 저장
  └─ Tier 3: config.json sessionDefaults  ← 프로젝트 기본값
```

Tier 2에서 읽으면 동시에 `/tmp` 파일을 복원한다. 다음 호출부터는 다시 Tier 1(빠른 경로)로 돌아간다. 자가 복구 구조.

## macOS에서 프로세스 감지가 어려운 이유

안정화 과정에서 하나 더 해결한 문제가 있다. process scanner가 "이 세션이 아직 살아있는가?"를 판단하는 로직이다.

`lsof -d cwd`로 각 Claude 프로세스의 작업 디렉토리를 가져와서 세션과 매칭하려 했는데, macOS에서는 모든 Claude 프로세스가 `~/`를 cwd로 보고한다. 세션 구분 불가.

결국 **PID 수량 비교 + transcript 파일 수정 시각 랭킹**으로 해결했다:

- top-level PID 수 >= 세션 수 → 전부 alive
- PID < 세션 → transcript mtime이 오래된 세션부터 `disconnected` 처리
- 30초 후에도 여전하면 `ended`로 에스컬레이션

서브에이전트(Claude가 Agent tool로 생성)는 parent PID가 다른 Claude인 것으로 필터링해서 카운트에서 제외한다.

## 테스트

오늘 하루 동안 55개 → 90개로 35개 테스트를 추가했다. process scanner, session defaults, API integration 테스트가 주요 추가분이다.

---

[Claude Multiple Dashboard](https://github.com/hey00507/claude-multiple-dashboard) — npm install로 바로 쓸 수 있다.
