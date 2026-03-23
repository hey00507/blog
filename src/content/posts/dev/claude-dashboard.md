---
title: "Claude Multiple Dashboard — 멀티 세션 관제탑 만들기"
description: "Claude Code를 병렬로 3~5개 띄워 작업할 때, 모든 세션을 한 화면에서 실시간 모니터링하는 웹 대시보드를 만들었다."
category: dev
tags: ["claude-code", "typescript", "fastify", "sse", "vanilla-js", "dashboard"]
pubDate: 2026-03-17T10:51:00
series: "Claude Productivity"
---

Claude Code로 작업할 때, 나는 보통 3~5개 세션을 동시에 띄운다. 프로젝트마다 하나씩, 병렬로 돌리면 생산성이 확 올라간다.

문제는 **어떤 세션이 입력을 기다리고 있는지 파악하기 어렵다**는 것이다. 터미널 탭을 하나씩 클릭해서 확인하다 보면, 10분 넘게 방치된 세션이 발견되기도 한다. 그래서 만들었다.

## 한눈에 보기

![라이트 모드 전체 화면](/images/posts/claude-dashboard/light-overview.png)

세션 카드에는 상태 아이콘, 모델명(Opus 4.6 등), 컨텍스트 사용률, 경과 시간이 실시간으로 표시된다. 응답이 끝나면 idle time 카운터가 시작되고, 브라우저 탭 타이틀에 대기 세션 수가 뱃지로 뜬다.

## 동작 원리

Claude Code의 **Hook 시스템**을 활용한다.

```
Claude Code 세션 → hook event (JSON)
    → dashboard-hook.sh → curl POST (1초 timeout)
    → Fastify 서버 → 세션/로그 저장 + SSE 브로드캐스트
    → 브라우저 실시간 갱신
```

핵심 설계 원칙은 **비간섭**이다. hook 스크립트가 서버에 POST를 보내되, 서버가 꺼져 있으면 그냥 무시한다. Claude Code 성능에 영향 0.

6개 hook 이벤트를 수신한다:

| 이벤트 | 역할 |
|--------|------|
| `SessionStart` | 세션 시작/재개 감지 |
| `UserPromptSubmit` | 사용자 프롬프트 기록 |
| `PostToolUse` | 도구 사용 추적 |
| `Stop` | 응답 완료 → idle 진입 |
| `Notification` | 권한 요청 감지 |
| `SessionEnd` | 세션 종료 |

## 주요 기능

### 실시간 통계 + 활동 히트맵

세션 목록 아래에 오늘의 통계가 실시간으로 집계된다. 도구 사용 빈도 Top 10 바 차트와 24시간 활동 히트맵도 함께 표시된다. 통계 카드를 클릭하면 히스토리가 해당 필터로 자동 전환된다.

### 세션 상세 패널

![다크 모드 + 상세 패널](/images/posts/claude-dashboard/dark-detail.png)

세션 카드를 클릭하면 우측에 상세 패널이 열린다. 타임라인에서 프롬프트, 응답, 도구 사용을 시간순으로 확인할 수 있고, Enter 키로 풀뷰 전환도 가능하다. MD 버튼을 누르면 전체 대화가 Markdown 파일로 내보내진다.

### 프로젝트 그룹핑 & 즐겨찾기

같은 디렉토리에서 실행된 세션은 자동으로 그룹화된다. 중요한 세션은 핀 버튼으로 상단에 고정할 수 있다.

### 다크/라이트 테마 & 키보드 단축키

시스템 설정을 자동 감지하고, 수동 토글도 가능하다. `j`/`k`로 세션을 탐색하고, `/`로 검색, `?`로 단축키 도움말을 볼 수 있다.

<img src="/images/posts/claude-dashboard/shortcuts.png" style="max-width: 300px; width: 100%;" alt="키보드 단축키">

## 설치 (3줄)

```bash
npm install -g claude-multiple-dashboard
claude-dash init    # hooks 등록 + 데이터 디렉토리 생성
claude-dash open    # 서버 시작 + 브라우저 열기
```

이후 Claude Code를 평소처럼 사용하면 된다. hook이 자동으로 이벤트를 대시보드에 전달한다.

## 기술 스택

| 구성 | 기술 | 선택 이유 |
|------|------|-----------|
| Server | Fastify 5 | 가볍고 빠른 Node.js 서버 |
| Frontend | Vanilla JS (ES Modules) | 빌드 도구 없이 브라우저에서 직접 실행 |
| Real-time | SSE | WebSocket보다 단순, 단방향 이벤트에 적합 |
| Storage | 로컬 파일시스템 (JSON + JSONL) | DB 없이 즉시 사용 가능 |
| Test | Vitest (41개) | TypeScript 네이티브 지원 |

프론트엔드를 React나 Vue 대신 Vanilla JS로 만든 이유는 **번들 사이즈 0**을 유지하고 싶었기 때문이다. `public/` 폴더의 파일을 그대로 서빙하면 끝이다. 7개 ES Module로 분리해서 유지보수성도 확보했다.

## GitHub

- Repository: [hey00507/claude-multiple-dashboard](https://github.com/hey00507/claude-multiple-dashboard)
- npm: `claude-multiple-dashboard@0.3.1`

Claude Code를 멀티 세션으로 쓰는 사람이라면 한번 써보길 추천한다. 설치 3줄이면 끝이고, 한번 세팅하면 알아서 돌아간다.
