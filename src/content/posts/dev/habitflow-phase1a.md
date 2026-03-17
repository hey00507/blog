---
title: "HabitFlow — SwiftUI + Firebase로 습관 트래커 만들기 (Phase 1a)"
description: "Swift를 처음 써보면서 하루 만에 습관 트래커 MVP를 완성한 과정. xcodegen, TDD, Swift 6 Concurrency까지."
category: dev
tags: ["swift", "swiftui", "firebase", "tdd", "ios", "xcodegen"]
pubDate: 2026-03-17T10:30:00
series: "HabitFlow 개발기"
---

매일의 습관을 기록하고, GitHub 스타일 잔디로 시각화하는 개인용 앱을 만들고 있다. 이름은 **HabitFlow**. [마이루틴](https://myroutine.today)에서 아이디어를 착안했고, SwiftUI + Firebase Firestore 조합으로 개발 중이다.

오늘 Phase 1a(기본 동작)를 하루 만에 전부 구현했다. Swift를 처음 써보는 상태에서 시작했는데, Claude Code와 함께 작업하니 생각보다 빠르게 진행됐다.

## 데모 영상

<video src="/videos/habitflow-phase1a.mp4" controls playsinline width="100%" style="max-width: 400px; border-radius: 12px;"></video>

## 기술 스택

| 항목 | 선택 |
|------|------|
| UI | SwiftUI (iOS 17+) |
| Database | Firebase Firestore |
| Auth | Firebase Anonymous Auth |
| Test | Swift Testing |
| Architecture | MVVM |
| Project | xcodegen (project.yml) |

## 왜 Firebase?

무료 Apple 개발자 계정에서는 CloudKit을 쓸 수 없다. Firebase Firestore는 계정 종류와 무관하게 사용 가능하고, 오프라인 퍼시스턴스 + 실시간 동기화가 무료다. 개인 습관 트래커 수준이면 무료 한도(저장 1GB, 읽기 5만/일)로 충분하다.

## 오늘 한 일 (M1 ~ M5)

### M1. 프로젝트 초기화

CLI에서 Xcode 프로젝트를 만들기 위해 **xcodegen**을 사용했다. `project.yml` 하나로 `.xcodeproj`를 생성할 수 있어서, Git에는 YAML만 올리고 `.xcodeproj`는 `.gitignore`에 넣었다.

```yaml
# project.yml 핵심 부분
name: HabitFlow
packages:
  firebase-ios-sdk:
    url: https://github.com/firebase/firebase-ios-sdk.git
    from: "11.0.0"
targets:
  HabitFlow:
    type: application
    platform: iOS
    dependencies:
      - package: firebase-ios-sdk
        product: FirebaseAuth
      - package: firebase-ios-sdk
        product: FirebaseFirestore
```

### M2. 데이터 모델 + 서비스 레이어 (TDD)

TDD First 원칙에 따라 테스트를 먼저 작성하고 구현했다.

**데이터 모델:**
```swift
struct Habit: Codable, Identifiable, Sendable, Hashable {
    var id: String?
    var name: String
    var icon: String       // SF Symbol
    var color: String      // hex
    var schedule: [Int]    // 반복 요일 (1=일 ~ 7=토)
    var targetTime: String?
    var createdAt: Date
    var isArchived: Bool
}
```

**서비스 추상화:**
- `HabitServiceProtocol` — CRUD 인터페이스
- `FirestoreHabitService` — 실제 Firestore 구현
- `MockHabitService` — 테스트/프리뷰용 Mock

Protocol로 추상화해두니 테스트에서 Mock을 주입하고, 프로덕션에서는 Firestore를 주입하는 구조가 깔끔하게 나왔다.

### M3. 인증 + 보안

Firebase Anonymous Auth로 자동 로그인을 구현했다. 앱 시작 시 세션 복구 → 없으면 익명 로그인.

Firestore 보안 규칙은 uid 기반 접근 제어:
```
match /users/{userId}/{document=**} {
  allow read, write: if request.auth != null
                     && request.auth.uid == userId;
}
```

public 레포이기 때문에 `GoogleService-Info.plist`는 `.gitignore`에 추가했다.

### M4. 습관 CRUD UI

SwiftUI로 습관 목록 + 등록/수정 폼을 만들었다.

- **HabitListView**: 습관 목록 + 스와이프 삭제/보관
- **HabitFormView**: 이름, SF Symbol 아이콘 피커(16종), 색상 피커(8색), 요일 선택, 시간 설정

### M5. 오늘의 습관 + 체크

앱의 핵심 화면. 오늘 요일에 해당하는 습관만 필터링하고, targetTime 기준으로 정렬. 탭 한 번으로 체크/체크해제.

TabView 구조로 "오늘" 탭과 "습관 목록" 탭을 분리했다.

## Swift 6에서 겪은 일들

Swift를 처음 써봤는데, 문법 자체보다 **Swift 6의 Strict Concurrency**가 가장 까다로웠다.

### @DocumentID 제거

Firebase의 `@DocumentID` 프로퍼티 래퍼가 `Sendable`을 준수하지 않아서, 모델에 `Sendable`을 붙이면 컴파일 에러가 났다. 결국 `@DocumentID`를 제거하고 `CodingKeys`에서 id를 제외한 뒤, `doc.documentID`를 수동으로 할당하는 방식으로 우회했다.

### @MainActor 전파

`@Observable` ViewModel에 `@MainActor`를 붙이면, 해당 ViewModel을 사용하는 테스트 코드에도 `@MainActor`를 붙여야 한다. Swift 5에서는 없던 패턴이라 처음엔 당황했는데, "UI 상태를 건드리는 코드는 전부 메인 스레드에서"라는 원칙이 컴파일러 레벨에서 강제되는 것이었다.

## 테스트 현황

총 **25개 테스트** 전체 통과.

| Suite | 테스트 수 | 커버리지 |
|-------|----------|---------|
| HabitService | 12개 | CRUD + 엣지케이스 |
| HabitListViewModel | 7개 | 로드/생성/수정/삭제/아카이브 |
| TodayViewModel | 5개 | 요일 필터/시간 정렬/체크 토글/완료율 |
| AuthService | 1개 | 초기 상태 |

## 다음 할 일 (Phase 1b)

- M6: GitHub 스타일 잔디 히트맵
- M7: Streak(연속 기록) 계산

레포는 public으로 운영 중이다: [github.com/hey00507/habitflow](https://github.com/hey00507/habitflow)
