---
title: "FindMyVibe — 도메인 레이어부터 쌓아올린 Phase 1 개발기"
description: "성향 분석 기반 취미 추천 서비스 FindMyVibe의 첫 번째 단계. 도메인 설계, TDD로 커버리지 100%, JPA Auditing까지 적용한 과정을 정리했다."
category: "dev"
subcategory: "project"
tags: ["spring-boot", "jpa", "tdd", "findmyvibe", "사이드프로젝트"]
pubDate: 2026-03-24T22:12:00
series: "FindMyVibe"
---

## 왜 시작했는가?

요즘 개인적인 공부를 하면서, 포트폴리오가 될 사이드 프로젝트가 하나쯤 있으면 좋겠다는 생각이 들었다.
회사에서 하는 프로젝트는 기술 스택이 제한적이고, 내가 직접 설계 판단을 내린 경험을 보여주기가 어렵기도 하고.

그래서 처음부터 기획 → 설계 → 구현까지 직접 하는 프로젝트를 하나 만들기로 했음.
또한 VibeCoding으로 내가 익숙한 **스프링부트 + 자바 웹개발**을 진행하면 얼마나 체감될지도 궁금했다.

### FindMyVibe란?

**MBTI 같은 질문에 답하면 나한테 맞는 취미나 원데이클래스를 추천해주는 서비스**.

1. 서버가 기본 질문 5~7개를 던짐 (실내 vs 야외, 혼자 vs 여럿, 활동적 vs 정적 같은 것들)
2. 사용자가 답하면, Claude API가 답변을 분석해서 꼬리질문 3~5개를 더 만듦
3. 총 10~15개 질문으로 성향 프로필을 생성하고, 매칭 점수가 높은 활동 5개를 추천

백엔드는 Spring Boot + Java 25, LLM은 Claude API(Anthropic Java SDK), 프론트는 React로 잡았다.

누군가 나에게
"시스템 설계 해보셨어요?", "LLM 연동 경험 있으세요?", "테스트 전략은?", "설계부터 배포까지의 사이클 경험은?"
같은 질문을 한다면, 이 프로젝트 하나로 대답할 수 있게 만드는 게 목표.

### 기술 스택

| 항목 | 선택 | 이유 |
|------|------|------|
| Language | Java 25 | Virtual Threads, Structured Concurrency |
| Framework | Spring Boot 3.5 | Spring MVC + Virtual Threads로 WebFlux 없이 높은 동시성 |
| LLM | Claude API | 스트리밍 + Tool Use |
| Database | PostgreSQL 17 | JSONB, Full-Text Search |
| Cache | Redis 7 | 캐시 + Rate Limit + 세션 TTL |
| Test | JUnit 5 + Mockito + ArchUnit | 아키텍처 규칙 테스트 포함 |

PRD를 작성하면서 Phase 1~4까지 마일스톤을 나눠놨음.
오늘은 그 중 Phase 1의 첫 단계인 **도메인 레이어 구축** 이야기.

## 도메인 레이어부터

Phase 1의 첫 번째 작업 — 도메인 Entity + Enum + Repository 생성.

### 핵심 도메인 모델

데이터 흐름을 따라가면, 필요한 Entity가 자연스럽게 나온다.

```
Session (분석 한 건)
  ├── Question (질문 — 기본 7개 + 꼬리질문 동적 생성)
  ├── Answer (사용자 답변)
  ├── Profile (성향 프로필 — 키워드, 특성)
  └── Recommendation (추천 결과 — 활동명, 매칭 점수)
```

Session이 중심.
"분석 시작"을 누르면 Session이 하나 생기고, 질문 → 답변 → 프로필 → 추천까지 전체 흐름이 하나의 Session 안에서 일어남.

**Enum은 두 개:**
- `SessionStatus` — `CREATED → BASIC_ANSWERED → COMPLETED` 상태 전이
- `QuestionType` — `BASIC` (고정) / `FOLLOW_UP` (Claude가 동적 생성)

### 설계에서 신경 쓴 것들

**팩토리 메서드 패턴 전부 적용.**

`new Entity()` 대신 `Session.create()`, `Question.createBasic()` 같은 정적 메서드로만 생성.
UUID 자동 생성, 초기 상태 CREATED 같은 규칙을 팩토리에서 강제해서 실수를 줄임.

```java
public static Session create() {
    Session session = new Session();
    session.id = UUID.randomUUID();
    session.status = SessionStatus.CREATED;
    return session;
}
```

**상태 전이도 도메인에서 검증.**

`CREATED`일 때만 `markBasicAnswered()`, `BASIC_ANSWERED`일 때만 `markCompleted()` 호출 가능.
잘못된 전이는 `IllegalStateException`으로 막는다.
DB 제약조건에 의존하기 전에 Java 코드에서 먼저 규칙을 지키는 구조.

```java
public void markBasicAnswered() {
    if (this.status != SessionStatus.CREATED) {
        throw new IllegalStateException(
            "기본 답변 완료는 CREATED 상태에서만 가능합니다. 현재: " + this.status);
    }
    this.status = SessionStatus.BASIC_ANSWERED;
}
```

**Profile의 JSON 필드 처리.**

`keywords`(리스트)와 `traits`(맵)를 PostgreSQL jsonb로 저장하고 싶었는데,
`columnDefinition = "jsonb"`를 쓰면 H2에서 테스트할 때 실패함.
`@JdbcTypeCode(SqlTypes.JSON)`만 붙이면 Hibernate가 DB에 맞게 자동 처리.

```java
// H2에서도, PostgreSQL에서도 동작
@JdbcTypeCode(SqlTypes.JSON)
@Column(nullable = false)
private List<String> keywords;
```

## TDD로 커버리지 100%

Claude Code와 함께 하는 바이브 코딩이니까, 테스트를 빡빡하게 가져가기로 했음.
예전에 토스의 테스트 커버리지 100% 관련 영상을 감명깊게 본 기억이 있다.

`사람이 직접 코드를 한 줄씩 타이핑하는 게 아니라, AI가 빠르게 코드를 생성하는 만큼 — 테스트가 최소한의 안전망 역할을 해야 한다고 생각했다.`

물론 무책임하게 코드를 방치할 생각은 없다.

### 테스트 구성

1차 마일스톤 기준,
총 **26개** 테스트 작성. 도메인 + 공통 레이어 커버리지 100% 달성.

| 테스트 | 종류 | 수 | 검증 내용 |
|--------|------|---|----------|
| SessionUnitTest | 단위 | 6 | 생성 초기값, 정상/비정상 상태 전이 |
| QuestionUnitTest | 단위 | 2 | BASIC/FOLLOW_UP 팩토리 |
| AnswerUnitTest | 단위 | 1 | 생성 + 관계 설정 |
| ProfileUnitTest | 단위 | 1 | JSON 필드 포함 생성 |
| RecommendationUnitTest | 단위 | 2 | 정상 생성 + matchScore 범위 검증 |
| BaseEntityUnitTest | 단위 | 2 | audit 필드 초기화 + 상속 |
| JpaAuditingConfigUnitTest | 단위 | 1 | AuditorAware 반환값 |
| JpaAuditingIntegrationTest | 통합 | 2 | persist/update 시 audit 자동 채움 |
| Repository 슬라이스 테스트 | 슬라이스 | 8 | 정렬, 세션 격리, Optional |

Entity 단위 테스트에서는 정상 케이스뿐 아니라 **비정상 전이 5가지**도 전부 검증.
CREATED에서 `markCompleted()` 호출 같은 케이스를 빼먹으면 나중에 버그가 된다.

Repository는 `@DataJpaTest` 슬라이스 테스트로 작성.
전체 Context 안 띄우고 JPA 빈만 로드하니까 속도가 빠름.
다만 여기서 함정이 하나 있었는데, 이건 JPA Auditing 이야기에서 다루겠다.

### TDD 엄격하게 지켰나?

솔직히, 전부 테스트 먼저 작성한 건 아님.

- Entity/Enum: 테스트 먼저 → 구현 (정석 TDD)
- Repository: 테스트 먼저 → 인터페이스 구현 (정석 TDD)
- BaseEntity/JpaAuditingConfig: **구현 먼저 → 테스트 나중** (TDD 위반)

BaseEntity 같은 인프라 코드는 "일단 만들고 테스트 붙이자"는 유혹에 넘어갔다.
다음부터는 인프라 코드도 테스트 먼저 작성하는 습관을 들여야겠음.

## JPA Auditing으로 BaseEntity 만들기

Entity 5개를 만들다 보니 `createdAt`, `modifiedAt` 같은 audit 필드가 전부 중복.
당연히 BaseEntity를 만들어서 상속받는 구조로 가야 한다.

회사에서도 여러 번 써봤던 익숙한 패턴.

```
BaseEntity (@MappedSuperclass)
├── createdAt   — @CreatedDate
├── createdBy   — @CreatedBy
├── modifiedAt  — @LastModifiedDate
└── modifiedBy  — @LastModifiedBy

모든 Entity extends BaseEntity
```

### 설정은 3가지

1. **BaseEntity** — `@MappedSuperclass` + `@EntityListeners(AuditingEntityListener.class)`
2. **Config** — `@EnableJpaAuditing` + `AuditorAware<String>` 빈 등록
3. **Entity** — `extends BaseEntity`

Phase 1은 인증이 없으니 `AuditorAware`는 "system" 고정.
Spring Security 붙이면 구현체만 교체하면 됨.

```java
@Configuration
@EnableJpaAuditing
public class JpaAuditingConfig {
    @Bean
    public AuditorAware<String> auditorAware() {
        return () -> Optional.of("system");
    }
}
```

### 그런데 테스트에서 삽질을 좀 했다

익숙하다고 생각했는데, 몇 가지 함정에 빠졌음.
그냥 설정하고 사용하기만 했지, 테스트할 생각은 처음이라 그런지...

**1. 단위 테스트에서 audit 필드가 null**

`@CreatedDate`는 JPA 컨텍스트에서만 동작.
해결은 간단 — BaseEntity 필드에 초기값을 넣으면 됨.

```java
@CreatedDate
@Column(nullable = false, updatable = false)
private LocalDateTime createdAt = LocalDateTime.now();  // 이게 핵심
```

**2. `@DataJpaTest`에서 Config가 안 잡힘**

`@DataJpaTest`는 JPA 빈만 로드해서 `JpaAuditingConfig`가 스캔 안 됨.
`@Import(JpaAuditingConfig.class)` 명시적으로 붙여야 한다.

```java
@DataJpaTest
@Import(JpaAuditingConfig.class)
@ActiveProfiles("local")
class JpaAuditingIntegrationTest { ... }
```

**3. `entityManager.clear()` 안 하면 검증이 무의미**

persist 후 바로 find하면 1차 캐시에서 원본 객체가 반환됨.
`clear()`로 캐시를 날려야 DB에서 다시 읽어옴.

```java
entityManager.persist(session);
entityManager.flush();
entityManager.clear();  // 이거 빠뜨리면 1차 캐시에서 반환

Session found = entityManager.find(Session.class, session.getId());
assertThat(found.getCreatedAt()).isNotNull();  // clear 해야 의미 있음
```

### 이김에 좀 더 깊이 파봤다

여기까지 하고 나니, JPA Auditing에 대해 좀 더 제대로 정리하고 싶어졌다.
회사에서는 "다들 이렇게 쓰니까" 하고 넘어갔던 것들 — 동작 원리, 장단점, H2 호환 같은 것들을 이번에 꽤 깊이 파봤음.

별도 글로 정리했다.

> 다음 글: **[Spring JPA Auditing 실전 적용 — BaseEntity + AuditorAware 깊이 파보기](/dev/findmyvibe-jpa-auditing/)**

## 커밋 로그

| 커밋 | 내용 | 파일 수 |
|------|------|---------|
| `e621145` | Entity 5개, Enum 2개, 단위 테스트 12개, JaCoCo 추가 | 14 |
| `cf5de13` | BaseEntity 도입 + JPA Auditing 설정 + Entity 리팩토링 | 9 |
| `249640a` | JpaAuditingConfig 단위/통합 테스트 추가 | 3 |
| `3dde5a4` | Repository 인터페이스 5개 + 슬라이스 테스트 8개 | 10 |

총 28개 파일, 1,451줄. 테스트 26개, 커버리지 100%.

## 남은 것

- **Flyway 마이그레이션** — DDL 스크립트 작성. 지금은 Hibernate 자동 생성이지만 운영은 Flyway로.
- **ArchUnit** — 도메인이 인프라에 의존하지 않는지, 순환 참조 검증.

내일 마무리할 예정.
도메인 레이어가 깔렸으니, API → Claude 연결 → 캐시는 그 다음 이야기가 될 것 같다.
