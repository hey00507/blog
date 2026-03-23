---
title: "HabitFlow M9 — iOS 로컬 알림 3종 구현기 (TDD)"
description: "SwiftUI 습관 트래커에 사전/미완료/종합 알림을 TDD로 구현하고, iOS 64개 제한을 우회하기까지"
category: "dev"
pubDate: "2026-03-18T01:19:00.000Z"
tags: ["swift", "swiftui", "ios", "tdd", "notification"]
draft: false
---

[지난 글](/posts/dev/habitflow-phase1a)에서 HabitFlow의 Phase 1a (Firestore CRUD + 기본 UI)를 TDD로 만든 이야기를 했다. 그 뒤로 GitHub 잔디 스타일 히트맵(M6)과 연속 달성 Streak(M7)도 구현했는데, 스크린샷이 아직 없어서 다음에 따로 다루겠다. 오늘은 가장 크게 손이 갔던 M9 — iOS 로컬 알림 구현을 정리한다.

## 습관 앱에서 알림은 핵심이다

습관 트래커의 존재 이유는 "잊지 않게 해주는 것"이다. 아무리 예쁜 UI를 만들어도, 알림이 안 오면 앱을 안 열게 된다.

### 알림 3종류

`/clarify`로 어떤 알림이 필요한지 정리한 결과:

1. **사전 알림** (10분 전) — "독서 할 시간이에요" (targetTime이 있는 습관만)
2. **미완료 개별 알림** (N시간 후) — "독서를 아직 안 했어요" (사용자 설정: 30분/1시간/2시간)
3. **미완료 종합 알림** (하루 끝) — "오늘 아직 3개 습관을 완료하지 않았습니다 (독서, 러닝, 영어)"

targetTime이 없는 습관(시간 상관없이 해야 하는 것)은 종합 알림에만 포함시켰다.

<div style="display: flex; flex-wrap: wrap; justify-content: center; gap: 12px; margin: 24px 0;">
  <img src="/images/posts/habitflow-m6m9/today-view.jpeg" alt="오늘 화면 — 습관 등록" style="max-width: 200px; width: 100%;" />
  <img src="/images/posts/habitflow-m6m9/settings-notification.jpeg" alt="설정 — 알림 옵션" style="max-width: 200px; width: 100%;" />
  <img src="/images/posts/habitflow-m6m9/notification-lockscreen.jpeg" alt="잠금화면에 알림 도착" style="max-width: 200px; width: 100%;" />
</div>

## iOS 알림 64개 제한

iOS는 앱당 예약 가능한 로컬 알림이 **최대 64개**다. 처음엔 "64개면 충분하지 않나?" 싶었는데, 계산해보면 전혀 아니다.

습관 5개 × (사전 + 미완료) 2개 = 하루 10개. 일주일이면 70개로 이미 초과한다.

**대응 전략: 앱 실행 시 동적 스케줄링.** 7일치만 예약하고, 앱을 열 때마다 갱신한다. 습관 트래커는 매일 여는 앱이니까 이 전략이 통한다. 앱을 일주일 동안 안 열면? 그건 이미 습관을 포기한 것이니까 알림이 없어도 상관없다.

## TDD 3단계

M9는 크기가 커서 3단계로 나눠 진행했다:

### M9a — NotificationScheduler + 사전 알림 (22개 테스트)

`NotificationScheduler`는 enum으로 만든 순수 함수 모음이다. 상태가 없어서 테스트하기 쉽다.

- `parseTime("09:30")` → `(hour: 9, minute: 30)`
- `preNotificationTime(targetTime, minutesBefore)` → 알림 발송 시각
- `shouldScheduleNotification(habit)` → 알림 대상 여부
- `notificationsForHabit(habit)` → 해당 습관의 전체 알림 목록

### M9b — 미완료 개별/종합 알림 (19개 테스트)

기존 Scheduler에 메서드 추가:

- `overdueNotificationsForHabit(habit, delayMinutes)` — 미완료 시 N분 후 알림
- `summaryMessage(habits)` — "오늘 아직 3개 습관을 완료하지 않았습니다 (독서, 러닝, 영어)"

리뷰에서 잡은 것: 음수 `delayMinutes` 방어(`guard >= 0`), `parseTime` 중복 호출 → 헬퍼 추출.

### M9c — 설정 UI (7개 테스트)

- `NotificationSettings` 모델: UserDefaults 저장 (masterEnabled, overdueDelay, dailySummaryTime)
- `SettingsViewModel`: 마스터 off → cancelAll, 마스터 on → rescheduleAll
- `SettingsView`: 토글, 딜레이 피커(30분/1시간/2시간), 시간 피커

리뷰에서 잡은 것: `onChange`에서 save가 다시 `onChange`를 트리거하는 무한 루프 → `isLoaded` 플래그로 방어.

## 실기기 연동

`MockNotificationService`로 로직을 다 검증한 후, `LocalNotificationService`를 만들어서 실제 `UNUserNotificationCenter`에 연결했다.

습관 생성 → 알림 스케줄링, 수정 → 재등록, 삭제 → 취소. 앱 시작 시 권한 요청 + 전체 재스케줄링.

실기기에서 10분 전 알림이 잠금화면에 뜨는 걸 확인했을 때의 그 뿌듯함.

## 현재 테스트

| 마일스톤 | 테스트 |
|---------|--------|
| M1~M5 (Phase 1a) | 25개 |
| M6 히트맵 | 18개 |
| M7 Streak | 10개 |
| M9 로컬 알림 | 48개 |
| **총계** | **101개** |

남은 마일스톤: M8(위젯), M10~M12(통계/성취/내보내기).
