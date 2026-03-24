---
title: "Spring JPA Auditing 실전 적용 — BaseEntity + AuditorAware 깊이 파보기"
description: "FindMyVibe 프로젝트에서 JPA Auditing을 적용하며 배운 것들. 동작 원리, 테스트 함정, H2 호환, 장단점까지 정리했다."
category: "dev"
subcategory: "til"
tags: ["spring-boot", "jpa", "jpa-auditing", "findmyvibe", "테스트"]
pubDate: 2026-03-24T22:31:00
series: "FindMyVibe"
---

> 이 글은 [FindMyVibe Phase 1 개발기](/dev/findmyvibe-phase1-domain/)에서 이어지는 글.
> 도메인 레이어 구축 과정에서 JPA Auditing을 적용하며 파보게 된 내용 정리.

## 왜 따로 정리하게 됐나

JPA Auditing + BaseEntity는 Spring 프로젝트에서 거의 표준처럼 쓰이는 패턴.
회사에서도 여러 번 써봤고, 설정 자체는 어렵지 않다.

그런데 이번에 FindMyVibe에서 **처음으로 테스트를 제대로 작성해봤다.**
설정하고 쓰기만 했지, 동작 원리나 테스트 함정은 깊이 생각해본 적이 없었다.

그래서 이김에 처음부터 정리해봤다.

## 핵심 구조

Entity를 저장/수정할 때 **누가 언제 했는지를 자동으로 채워주는 것**.

```
BaseEntity (@MappedSuperclass)
├── createdAt   — @CreatedDate       → persist 시 자동
├── createdBy   — @CreatedBy         → persist 시 자동
├── modifiedAt  — @LastModifiedDate  → persist/update 시 자동
└── modifiedBy  — @LastModifiedBy    → persist/update 시 자동

모든 Entity extends BaseEntity
```

이걸 안 쓰면 Entity마다 4개 필드를 일일이 선언하고, setter 호출을 빼먹으면 null이 들어간다.

## 설정 3가지

### 1. BaseEntity

```java
@Getter
@MappedSuperclass
@EntityListeners(AuditingEntityListener.class)
public abstract class BaseEntity {

    @CreatedDate
    @Column(nullable = false, updatable = false)
    private LocalDateTime createdAt = LocalDateTime.now();

    @CreatedBy
    @Column(nullable = false, updatable = false)
    private String createdBy = "system";

    @LastModifiedDate
    @Column(nullable = false)
    private LocalDateTime modifiedAt = LocalDateTime.now();

    @LastModifiedBy
    @Column(nullable = false)
    private String modifiedBy = "system";
}
```

필드 초기값(`= LocalDateTime.now()`)을 넣은 이유는 뒤에서 다룬다.

### 2. Config

```java
@Configuration
@EnableJpaAuditing
public class JpaAuditingConfig {
    @Bean
    public AuditorAware<String> auditorAware() {
        return () -> Optional.of("system");
        // Phase 2에서 Spring Security 붙이면 여기만 교체
    }
}
```

`@EnableJpaAuditing`이 Auditing 활성화, `AuditorAware`가 "누가"를 반환하는 구조.
나중에 `SecurityContextHolder`에서 꺼내는 구현체로 바꾸면 된다.

### 3. Entity

```java
@Entity
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class Session extends BaseEntity {
    // Session 고유 필드들...
}
```

`extends BaseEntity` 한 줄이면 끝.

## 동작 원리

JPA `EntityListener`가 라이프사이클 이벤트를 감지해서 audit 필드를 채운다.

- `@PrePersist` → Created/Modified 전부 채움
- `@PreUpdate` → Modified만 갱신

핵심은 **JPA 컨텍스트 안에서만 동작한다**는 점.
`new Entity()`로 만들 때는 아무 일도 일어나지 않고, `entityManager.persist()`를 호출해야 리스너가 작동한다.

## 테스트에서 만난 함정들

이론은 간단한데, 예상치 못한 곳에서 걸렸다.

### 함정 1: 단위 테스트에서 audit 필드가 null

```java
Session session = Session.create();
assertThat(session.getCreatedAt()).isNotNull();  // 실패!
```

JPA 컨텍스트 밖이니까 `@CreatedDate`가 동작하지 않는다.

**해결 — 필드에 초기값 넣기.**

```java
@CreatedDate
@Column(nullable = false, updatable = false)
private LocalDateTime createdAt = LocalDateTime.now();  // 이게 핵심
```

- **단위 테스트**: 초기값이 쓰인다 → null 아님
- **JPA persist**: `@CreatedDate`가 정확한 시점으로 덮어씀

초기값은 안전망이고, 운영에서는 JPA가 덮어쓰는 구조.

### 함정 2: `@DataJpaTest`에서 Config가 안 잡힌다

`@DataJpaTest`는 JPA 관련 빈만 로드하는 슬라이스 테스트.
`@Configuration`인 `JpaAuditingConfig`는 자동 스캔 대상이 아니다.

**해결 — `@Import`로 명시적으로 가져오기.**

```java
@DataJpaTest
@Import(JpaAuditingConfig.class)  // 이거 없으면 Auditing 안 됨
@ActiveProfiles("local")
class JpaAuditingIntegrationTest {
    @Autowired
    private TestEntityManager entityManager;

    @Test
    void persist시_audit_필드가_자동으로_채워진다() {
        Session session = Session.create();
        entityManager.persist(session);
        entityManager.flush();
        entityManager.clear();

        Session found = entityManager.find(Session.class, session.getId());
        assertThat(found.getCreatedAt()).isNotNull();
        assertThat(found.getCreatedBy()).isEqualTo("system");
    }
}
```

`@SpringBootTest`면 이런 문제가 없지만, 슬라이스 테스트 속도를 포기하고 싶지 않아서 `@Import`로 해결했다.

### 함정 3: `entityManager.clear()` 빠뜨리기

```java
entityManager.persist(session);
entityManager.flush();
// clear() 없이 바로 조회하면?

Session found = entityManager.find(Session.class, session.getId());
// → 1차 캐시에서 원본 객체가 그대로 반환!
```

`flush()`는 SQL을 DB에 보내지만, 1차 캐시는 그대로 유지된다.
`assertThat`이 통과해도 그건 BaseEntity 초기값이지, Auditing이 채운 값이 아닐 수 있다는 점.

**해결 — `clear()`로 1차 캐시를 날리면 된다.**

```java
entityManager.persist(session);
entityManager.flush();
entityManager.clear();  // 1차 캐시 비우기 → DB에서 다시 읽어옴
```

`clear()` 한 줄 차이로 테스트 신뢰성이 완전히 달라진다.

## H2와 PostgreSQL 호환

BaseEntity를 만드는 과정에서 같이 부딪힌 문제.

```java
// H2에서 테이블 생성 실패
@Column(nullable = false, columnDefinition = "jsonb")
private List<String> keywords;
```

`columnDefinition = "jsonb"`는 PostgreSQL 전용 DDL.

**해결 — `@JdbcTypeCode`만 쓰면 된다.**

```java
@JdbcTypeCode(SqlTypes.JSON)
@Column(nullable = false)
private List<String> keywords;
```

Hibernate가 DB 방언에 따라 자동 처리하는 구조.
H2에서는 JSON 문자열, PostgreSQL에서는 jsonb로 저장된다.
`columnDefinition`은 DB 종속적이고, `@JdbcTypeCode`는 DB 독립적인 셈.

## 장단점

| 장점 | 단점 |
|------|------|
| 보일러플레이트 제거 (4필드 x N테이블) | 암묵적 동작 — 디버깅 시 흐름 추적 한 단계 추가 |
| 누락 방지 (수동 setter 불필요) | JPA 없는 단위 테스트와의 간극 |
| AuditorAware 교체로 확장 용이 | 모든 Entity에 *By 컬럼 강제 |
| Spring 생태계 표준 패턴 | Java 단일 상속 제약 |

"모든 Entity에 *By 컬럼이 강제된다"는 점이 좀 아쉽긴 하다.
하지만 FindMyVibe 규모에서는 문제가 되지 않는다. Entity가 5개뿐이고 나중에 인증이 붙으면 전부 의미 있는 필드가 되는 셈.

## 적용 결과

- Entity 5개 모두 `extends BaseEntity`
- Phase 1에서는 `createdBy = "system"` 고정
- 테스트 26개, 커버리지 100%
- Answer의 `answeredAt`을 BaseEntity `createdAt`으로 통합 — 중복 제거

마지막이 좀 재밌는데, 처음에 `answeredAt`이라는 별도 필드를 만들었다가 "결국 createdAt이랑 같은 시점 아닌가?" 하고 지웠다.
BaseEntity 상속의 부수 효과로 중복 필드가 하나 줄어든 셈.

## 마무리

JPA Auditing은 설정 자체는 쉽다.
하지만 이번에 테스트를 작성하면서 "왜 이렇게 동작하는지"를 이해하게 된 것 같다.

`@DataJpaTest` + `@Import`, `entityManager.clear()`, BaseEntity 필드 초기화 — 이 세 가지가 JPA Auditing 테스트의 핵심 포인트.

다음에는 Flyway 마이그레이션과 ArchUnit을 마무리하고, Phase 1 나머지 이야기를 정리할 예정이다.
