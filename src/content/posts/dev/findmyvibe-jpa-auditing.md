---
title: "Spring JPA Auditing 실전 적용 — BaseEntity + AuditorAware 깊이 파보기"
description: "FindMyVibe 프로젝트에서 JPA Auditing을 적용하며 배운 것들. 동작 원리, 테스트 함정, H2 호환, 장단점까지 정리했다."
category: "dev"
subcategory: "til"
tags: ["spring-boot", "jpa", "jpa-auditing", "findmyvibe", "테스트"]
pubDate: 2026-03-24T22:31:00
series: "FindMyVibe"
---

> 이 글은 [FindMyVibe Phase 1 개발기](/dev/findmyvibe-phase1-domain/)에서 이어지는 글이다.</br>
> 도메인 레이어를 구축하면서 JPA Auditing을 적용했고, 그 과정에서 꽤 깊이 파보게 된 내용을 정리했다.

## 왜 이걸 따로 정리하게 됐나

JPA Auditing + BaseEntity 조합은 내가 경험한 Spring 프로젝트에서 거의 표준처럼 쓰이는 패턴이다.</br>
회사에서도 여러 번 써봤고, 설정하는 것 자체는 어렵지 않다.

그런데 이번에 FindMyVibe에서 이걸 적용하면서, **처음으로 테스트를 제대로 작성해봤다.**</br>
설정하고 쓰기만 했지, 이게 실제로 어떻게 동작하는지, 테스트에서 어떤 함정이 있는지는 깊이 생각해본 적이 없었다.

그래서 이김에 처음부터 정리해봤다.

## 핵심 구조

JPA Auditing이 해주는 건 단순하다.
Entity를 저장하거나 수정할 때, **누가 언제 했는지를 자동으로 채워주는 것**이다.

```
BaseEntity (@MappedSuperclass)
├── createdAt   — @CreatedDate       → persist 시 자동
├── createdBy   — @CreatedBy         → persist 시 자동
├── modifiedAt  — @LastModifiedDate  → persist/update 시 자동
└── modifiedBy  — @LastModifiedBy    → persist/update 시 자동

모든 Entity extends BaseEntity
```

이걸 쓰지 않으면 Entity마다 4개 필드를 일일이 선언하고, Service에서 매번 수동으로 시간을 넣어야 한다.</br>
Entity가 5개면 20개의 필드 선언이 중복되고, setter 호출을 빼먹으면 null이 들어간다.

## 필요한 설정 3가지

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

필드에 초기값(`= LocalDateTime.now()`)을 넣은 이유는 뒤에서 다룬다.

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

`@EnableJpaAuditing`이 JPA Auditing을 활성화하고, `AuditorAware`가 "누가"에 해당하는 값을 반환한다.</br>
지금은 인증이 없으니 "system" 고정이지만, 나중에 `SecurityContextHolder`에서 사용자 정보를 꺼내는 구현체로 바꾸면 된다.

### 3. Entity

```java
@Entity
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class Session extends BaseEntity {
    // Session 고유 필드들...
}
```

`extends BaseEntity` 한 줄이면 끝이다.

## 동작 원리

JPA의 `EntityListener`가 Entity 라이프사이클 이벤트를 감지해서 audit 필드를 채운다.

- `@PrePersist` 이벤트 → `@CreatedDate`, `@CreatedBy`, `@LastModifiedDate`, `@LastModifiedBy` 전부 채움
- `@PreUpdate` 이벤트 → `@LastModifiedDate`, `@LastModifiedBy`만 갱신

`AuditingEntityListener.class`가 이 이벤트를 처리하는 리스너다.
`@MappedSuperclass`에 `@EntityListeners`로 등록해두면, 이걸 상속받는 모든 Entity에 자동 적용된다.

핵심은 **이 모든 게 JPA 컨텍스트 안에서만 동작한다**는 점이다.</br>
`new Entity()`로 객체를 만들 때는 아무 일도 일어나지 않는다. `entityManager.persist()`를 호출해야 비로소 리스너가 작동한다.

## 테스트에서 만난 함정들

이론은 간단한데, 테스트를 작성하면서 예상치 못한 곳에서 걸렸다.

### 함정 1: 단위 테스트에서 audit 필드가 null

```java
// 이렇게 하면 createdAt이 null이다
Session session = Session.create();
assertThat(session.getCreatedAt()).isNotNull();  // 실패!
```

`Session.create()`는 내부적으로 `new Session()`을 호출한다.
JPA 컨텍스트 밖이니까 `@CreatedDate`가 동작하지 않고, 필드는 null.

**해결: BaseEntity 필드에 초기값을 넣는다.**

```java
@CreatedDate
@Column(nullable = false, updatable = false)
private LocalDateTime createdAt = LocalDateTime.now();  // 이게 핵심
```

이러면 두 가지 시나리오에서 모두 동작한다.

- **단위 테스트** (`new Entity()`): 초기값 `LocalDateTime.now()`가 쓰인다 → null 아님
- **JPA persist** (`entityManager.persist()`): `@CreatedDate`가 정확한 시점으로 덮어쓴다

초기값은 "안전망"이고, 실제 운영에서는 JPA가 덮어쓰니까 문제없음!

### 함정 2: `@DataJpaTest`에서 Config 클래스가 안 잡힌다

```java
@DataJpaTest
class JpaAuditingIntegrationTest {
    // @EnableJpaAuditing이 안 걸려 있어서 audit 필드가 안 채워진다!
}
```

`@DataJpaTest`는 JPA 관련 빈만 로드하는 슬라이스 테스트다.</br>
`@Configuration`으로 등록한 `JpaAuditingConfig`는 자동 스캔 대상이 아니다.

**해결: `@Import`로 명시적으로 가져온다.**

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

`@SpringBootTest`를 쓰면 전체 컨텍스트가 올라가니까 이런 문제가 없다.</br>
하지만 슬라이스 테스트의 장점(속도)을 포기하고 싶지 않았기 때문에 `@Import`로 해결!

### 함정 3: `entityManager.clear()` 빠뜨리기

```java
entityManager.persist(session);
entityManager.flush();
// clear() 없이 바로 조회하면?

Session found = entityManager.find(Session.class, session.getId());
// → 1차 캐시에서 원본 객체가 그대로 반환된다!
// → audit 필드가 DB에서 읽어온 게 아니라 메모리에 있던 값이다.
```

`flush()`는 SQL을 DB에 보내지만, 1차 캐시는 그대로 유지된다.</br>
`find()`를 하면 DB를 거치지 않고 캐시에서 바로 꺼내온다.

이 상태에서 `assertThat(found.getCreatedAt()).isNotNull()`이 통과해도, 그건 BaseEntity의 초기값(`LocalDateTime.now()`)이지 JPA Auditing이 채운 값이 아닐 수 있다.

**해결: `clear()`로 1차 캐시를 날린다.**

```java
entityManager.persist(session);
entityManager.flush();
entityManager.clear();  // 1차 캐시 비우기

Session found = entityManager.find(Session.class, session.getId());
// → DB에서 다시 읽어옴 → Auditing이 실제로 동작했는지 검증 가능
```

`clear()` 한 줄 차이로 테스트의 신뢰성이 완전히 달라진다.</br>
이걸 모르고 넘어가면 "테스트는 통과하는데 실제로는 Auditing이 안 걸려 있는" 상황이 생길 수 있다.

## H2와 PostgreSQL 호환 문제

이건 JPA Auditing과 직접적인 관계는 없지만, BaseEntity를 만드는 과정에서 같이 부딪힌 문제다.

```java
// 이렇게 하면 H2에서 테이블 생성이 실패한다
@Column(nullable = false, columnDefinition = "jsonb")
private List<String> keywords;
```

`columnDefinition = "jsonb"`는 PostgreSQL 전용 DDL이다.
H2에는 `jsonb` 타입이 없으니까 `Table not found` 에러가 난다.

**해결: `@JdbcTypeCode`만 쓴다.**

```java
@JdbcTypeCode(SqlTypes.JSON)
@Column(nullable = false)
private List<String> keywords;
```

Hibernate가 DB 방언(Dialect)에 따라 알아서 처리해준다.
- H2: JSON 문자열로 저장
- PostgreSQL: jsonb로 저장

`columnDefinition`은 DDL을 직접 지정하는 거라서 DB 종속적이다.  
`@JdbcTypeCode`는 Hibernate 레벨에서 타입을 매핑하는 거라서 DB 독립적이다.

## 장단점 정리

직접 써보고 나니 장단점이 좀 더 선명하게 보인다.

| 장점 | 단점 |
|------|------|
| 보일러플레이트 제거 (4필드 x N테이블) | 암묵적 동작 — 디버깅 시 흐름 추적 한 단계 추가 |
| 누락 방지 (수동 setter 불필요) | JPA 없는 단위 테스트와의 간극 |
| AuditorAware 교체로 확장 용이 | 모든 Entity에 *By 컬럼 강제 (불필요할 수도) |
| Spring 생태계 표준 패턴 | Java 단일 상속 제약 (BaseEntity에 계속 쌓임) |

"모든 Entity에 *By 컬럼이 강제된다"는 점은 좀 아쉬운 부분이다.  
어떤 Entity는 "누가" 만들었는지가 중요하지 않을 수 있는데, BaseEntity를 상속받는 순간 `createdBy`, `modifiedBy` 컬럼이 무조건 생긴다.

하지만 FindMyVibe 규모에서는 이게 문제가 되지 않는다.  
Entity가 5개밖에 안 되고, 나중에 인증이 붙으면 전부 의미 있는 필드가 된다.

## 실제 적용 결과

FindMyVibe Phase 1에서의 적용 결과를 정리하면 이렇다.

- Entity 5개 (Session, Question, Answer, Profile, Recommendation) 모두 `extends BaseEntity`
- Phase 1에서는 `createdBy = "system"` 고정
- 테스트 26개, 커버리지 100% 달성
- Answer의 `answeredAt` 필드를 BaseEntity의 `createdAt`으로 통합 — 중복 제거

마지막 항목이 좀 재밌는데, </br>처음에 Answer에 `answeredAt`이라는 별도 필드를 만들었다가 "이거 결국 createdAt이랑 같은 시점 아닌가?"하고 지웠다.  
BaseEntity 상속의 부수 효과로 중복 필드가 하나 줄어든 셈이다.

## 마무리

JPA Auditing은 설정 자체는 쉽다.
하지만 이번에 테스트를 작성하면서 "왜 이렇게 동작하는지"를 이해하게 된 것 같다.

특히 `@DataJpaTest` + `@Import`, `entityManager.clear()`, BaseEntity 필드 초기화 — 이 세 가지는 JPA Auditing을 테스트할 때 꼭 알아야 하는 포인트라고 생각한다.

다음에는 Flyway 마이그레이션과 ArchUnit 아키텍처 테스트를 마무리하고, Phase 1의 나머지 이야기를 정리할 예정이다.
