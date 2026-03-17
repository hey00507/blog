---
title: "의성데이터포털 — 0에서 운영까지, 백엔드 7개월 회고"
description: "농업 데이터 거버넌스 포털의 백엔드 API 서버를 구축부터 운영까지 담당하며 배운 보안, 아키텍처, 코드 품질에 대한 실전 경험을 정리했다."
category: dev
subcategory: work
tags: ["spring-boot", "java", "security", "jpa", "postgresql", "portfolio"]
pubDate: 2026-03-17T13:22:00
series: "프로젝트 회고"
---

의성데이터포털은 의성군의 농업 데이터를 수집·저장·공유·진단하는 통합 플랫폼이다. 나는 이 프로젝트의 **백엔드 API 서버를 0에서부터 구축**하고, 보안 점검과 감리를 거쳐 운영까지 이끌었다.

총 621 커밋 중 509건(82%)을 작성했고, 2025년 8월부터 2026년 3월까지 약 7개월간 진행했다.

## 기술 스택

| 구분 | 기술 |
|------|------|
| Language | Java 8 |
| Framework | Spring Boot 2.7.18 |
| Database | PostgreSQL + HikariCP |
| ORM | Spring Data JPA / Hibernate |
| Auth | JWT (jjwt 0.11.5) + Spring Security |
| Encryption | CubeOneAPI (AES/SHA) |
| API Docs | Swagger/OpenAPI 3 |
| Email | AWS SES |
| Build | Gradle + WAR (외장 Tomcat) |
| Code Quality | Spotless (Eclipse JDT) |

## 내가 한 일 — 타임라인

### Phase 1: 프로젝트 구축 (2025.08)

Spring Boot 프로젝트 초기 세팅부터 시작했다.

- DB 설정 및 JWT 인증 시스템 구현
- 사용자 로그인 / 비밀번호 검증 기능 개발
- 권한/유저-권한 매핑 API, 메뉴 관리 기능 개발
- Swagger 등록 및 API 문서화

기존 프로젝트가 Mybatis 기반이었지만, **JPA로 전환**하기로 결정했다. 데이터 거버넌스 도메인은 표준사전(용어, 단어, 도메인, 코드) 같은 도메인 객체 중심의 CRUD가 많아서, JPA의 `JpaRepository`가 더 적합하다고 판단했다.

### Phase 2: 데이터 표준 관리 (2025.09)

핵심 비즈니스 로직 — **표준사전 4종**(용어, 단어, 도메인, 코드)의 전체 CRUD API를 개발했다.

- 패키지 구조를 DataGovernance 규격에 맞게 전면 재편
- DB 스키마 변경에 따른 Entity 전환 (복합키 → 단일 PK + Unique 검증)
- SoftDelete 전환, BatchDeletionResult 구현
- ResultEntity 통합 응답 체계 설계

PK 설계에서 **복합키 vs 단일 PK**를 두고 고민했다. 초기에는 복합키를 사용했지만, JPA에서의 관리 복잡도와 향후 확장성을 고려해 SerialNo 단일 PK + Repository 레벨의 유니크 검증 방식으로 전환했다.

### Phase 3: 데이터 공유/연계 시스템 (2025.10 ~ 11 초)

- 데이터 공유 관리 시스템 (파일 업로드/다운로드, 데이터 검색)
- 연계 데이터 수집/메타데이터 관리
- 배치 작업, 품질 진단 시스템 연동
- 데이터 변경 이력 적재 및 조회 기능 개발

### Phase 4: 보안 강화 + 코딩 가이드라인 (2025.11)

**프로젝트에서 가장 밀도 높았던 시기.** 보안 취약점 점검, 암호화, 감리 대응이 동시에 진행되었다. 아래에서 자세히 다룬다.

### Phase 5~6: 감리 대응 + 코딩 표준 심화 (2025.12)

- 감리 지적사항 대응 — Exception 구체화, `printStackTrace` → `log.error` 전환
- 예외별 세부 대응 처리 (전 영역 60건+)
- TTAK.KO-11.0183 기반 규칙별 분석 및 수정
- 보안 취약점 최종 보고서 작성

### Phase 7: 유지보수 (2026.01 ~ 03)

- DB 커넥션 풀 최적화 (주말 유휴 커넥션 유지)
- 메타데이터 상세 데이터 추출 API 신규 개발
- 마스킹 처리 세밀 조정 (관리자 조회 시 마스킹 해제)

---

## 설계 고민 1 — 통합 응답 체계

각 API가 서로 다른 형태로 응답하면 프론트엔드 파싱이 지옥이 된다. 제네릭 `ResultEntity<T>`를 만들어 **모든 API의 응답을 통일**했다.

```java
// 성공: { success: true, code: 200, data: {...} }
public static <T> ResultEntity<T> success(T data) {
    return new ResultEntity<>(true, 200, "요청이 성공적으로 처리되었습니다.", data, null);
}

// 검증 실패: { success: false, code: 400, errors: [{field, message}] }
public static <T> ResultEntity<T> validationError(List<FieldError> errors) {
    return new ResultEntity<>(false, 400, "입력값 검증에 실패했습니다.", null, errors);
}

// 부분 성공 (일괄 삭제에서 일부만 성공한 경우)
public static <T> ResultEntity<T> partialSuccess(String message, T data) {
    return new ResultEntity<>(true, 206, message, data, null);
}
```

**206 Partial Content**를 추가한 건 실무에서 꼭 필요했다. 일괄 삭제에서 일부만 성공한 경우, 200이면 "왜 일부만 삭제됐지?"를 알 수 없고, 400이면 "성공한 건 뭐야?"가 모호해진다.

교훈: 통합 응답 객체는 **프로젝트 초기**에 만들어야 한다. 나중에 도입하면 기존 API 전부 수정해야 한다.

---

## 설계 고민 2 — 보안 취약점 대응 (CWE)

### 오류 메시지 정보 노출 (CWE-209)

가장 많이 수정한 취약점이다. `e.getMessage()`를 그대로 응답에 담으면 **DB 경로, 쿼리, 서버 경로**가 다 노출된다.

`SecureLogUtil`을 만들어 환경별로 에러 메시지를 분기했다.

```java
public static String getSafeMessage(Exception ex) {
    String errorId = generateErrorId(); // UUID 8자리
    if (PROD_PROFILE.equals(profile)) {
        // 프로덕션: 에러 ID만 반환
        return String.format("오류가 발생했습니다. (에러ID: %s)", errorId);
    }
    // 개발: 민감정보 마스킹 후 반환
    return maskSensitiveData(ex.getMessage());
}
```

마스킹은 정규식으로 **파일 경로, DB 정보, IP, 이메일**을 자동으로 잡아낸다.

```java
result = FILE_PATH_PATTERN.matcher(result).replaceAll("[PATH]");
result = DB_INFO_PATTERN.matcher(result).replaceAll("[DB_INFO]");
result = IP_PATTERN.matcher(result).replaceAll("[IP]");
result = EMAIL_PATTERN.matcher(result).replaceAll("[EMAIL]");
```

에러 ID로 서버 로그를 역추적할 수 있어 디버깅에도 문제 없다.

### 무차별 대입 공격 (CWE-307)

로그인 API에 Rate Limiting이 없으면 무한 시도가 가능하다. **IP 기반 LoginRateLimiter**를 구현했다.

```java
// ConcurrentHashMap으로 IP별 시도 횟수를 추적
// 10회 초과 시 5분 차단, 10분 후 자동 리셋
attemptCache.compute(ipAddress, (key, existingInfo) -> {
    if (existingInfo == null) return new LoginAttemptInfo();
    existingInfo.incrementAttempts();
    if (existingInfo.getAttempts() > MAX_ATTEMPTS && !existingInfo.isBlocked()) {
        existingInfo.block(LocalDateTime.now().plusMinutes(BLOCK_DURATION_MINUTES));
    }
    return existingInfo;
});
```

Username이 아닌 **IP 기반**으로 추적한 이유: Username 기반이면 공격자가 타인의 계정을 의도적으로 잠글 수 있다(DoS). IP 기반이면 공격자 자신만 차단된다. 다만 공유 IP 환경에서의 trade-off는 인지하고 있다.

### 파일 업로드 — 3중 방어

1. **확장자 블랙리스트** (exe, php, jsp 등 40종+)
2. **확장자 화이트리스트** (csv, json, xml만 허용)
3. **파일 내용 파싱 검증** (CSV Injection, XXE 공격 방지)

블랙리스트만으로는 부족하다. 새로운 위험한 확장자가 나올 수 있기 때문에 화이트리스트와 반드시 병행해야 한다.

XML 파서에는 XXE 공격 방지 설정이 필수다.

```java
DocumentBuilderFactory factory = DocumentBuilderFactory.newInstance();
factory.setFeature("http://apache.org/xml/features/disallow-doctype-decl", true);
factory.setFeature("http://xml.org/sax/features/external-general-entities", false);
factory.setFeature("http://xml.org/sax/features/external-parameter-entities", false);
factory.setXIncludeAware(false);
factory.setExpandEntityReferences(false);
```

### 전체 보안 대응 요약

| CWE 코드 | 취약점 | 대응 |
|-----------|--------|------|
| CWE-209 | 오류 메시지 정보 노출 | SecureLogUtil — 환경별 에러 메시지 분기 |
| CWE-307 | 무차별 대입 공격 | IP 기반 LoginRateLimiter |
| CWE-807 | 신뢰할 수 없는 입력 | JWT 토큰 형식 검증 강화 |
| CWE-495 | Mutable 객체 노출 | 방어적 복사 + unmodifiableList |
| CWE-539/614 | 쿠키 보안 | Secure/HttpOnly 속성 추가 |
| CWE-390 | 빈 catch 블록 | 전 영역 예외별 세부 대응 (60건+) |

---

## 설계 고민 3 — 개인정보 마스킹

하나의 마스킹 규칙으로는 안 된다. 관리자 화면, 일반 사용자 화면, 엑셀 다운로드에서 각각 다른 수준의 마스킹이 필요했다.

| 데이터 | 일반 조회 | 관리자 조회 | 엑셀 다운로드 |
|--------|----------|------------|------------|
| 이메일 | `te**@email.com` | 원본 | 암호화된 값 |
| 전화번호 | `010****5678` | 원본 | 암호화된 값 |
| 이름 | `홍*동` | 원본 | 암호화된 값 |

```java
public static String maskName(String name) {
    if (name == null || name.isEmpty()) return name;
    if (name.length() == 2) return name.charAt(0) + "*";
    if (name.length() >= 3) {
        StringBuilder masked = new StringBuilder();
        masked.append(name.charAt(0));
        for (int i = 0; i < name.length() - 2; i++) masked.append("*");
        masked.append(name.charAt(name.length() - 1));
        return masked.toString();
    }
    return name;
}
```

마스킹은 **어디서 하느냐**가 중요하다. Entity 레벨에서 하면 관리자도 볼 수 없게 된다. Response DTO 레벨에서 해야 유연하게 제어할 수 있다.

---

## 설계 고민 4 — AOP 기반 요청 로깅

모든 API에 접속 로그를 남겨야 하는데, 각 Controller에 로깅 코드를 넣으면 중복이 심하고 빠뜨리기 쉽다.

`@Around` 어드바이스로 모든 `@RestController` 메서드를 감싸는 AOP Aspect를 구현했다.

```java
@Around("execution(* com.api..*.*(..)) && @within(RestController)")
```

각 API 호출마다 클라이언트 IP, 브라우저, JWT 토큰 정보, 메뉴 ID, 요청 파라미터를 추출해서 DB에 적재한다. `@Operation` 어노테이션에서 API 설명을 자동 추출하기 때문에, **Swagger 문서화와 로깅이 자연스럽게 동기화**된다.

에러 메시지는 `SecureLogUtil`로 마스킹해서 로깅하므로, 접속 로그 테이블에 민감정보가 남지 않는다.

---

## 설계 고민 5 — DB 커넥션 풀

월요일 아침에 API가 먹통이 되는 현상이 있었다. 주말 동안 트래픽이 0이면 DB 커넥션이 전부 끊어지고, 월요일에 새 커넥션을 만드는 데 시간이 걸렸다.

HikariCP의 `keepaliveTime`을 5분으로 설정해서 해결했다.

```yaml
maximum-pool-size: 20
minimum-idle: 5
keepalive-time: 300000    # 5분마다 keepalive
max-lifetime: 1800000     # 30분
leak-detection-threshold: 60000  # 커넥션 누수 60초 감지
```

`idleTimeout`만 설정하면 커넥션이 살아는 있지만, **DB 측에서** 끊을 수 있다. `keepaliveTime`은 클라이언트(앱) 측에서 능동적으로 커넥션을 검증하는 것이다.

---

## 설계 고민 6 — 코딩 가이드라인과 자동화의 한계

TTAK.KO-11.0183 국가 표준 기반 코딩 가이드라인을 전체에 적용해야 했다. 검출 도구가 **2,851건**을 뱉었다.

접근 방식:
1. **자동 수정 가능한 것 먼저** — Spotless(Eclipse JDT)로 들여쓰기, import 정렬, 라인 길이 일괄 처리
2. **카테고리별 샘플링** — 중 시급도 1,165건을 전수 조사했더니 696건이 거짓 양성
3. **오검출 의견서 작성** — "왜 이것이 위반이 아닌지"를 근거와 함께 문서화
4. **실제 위반만 수정** — 매직 넘버 상수화, 빈 catch 블록 처리, Exception 구체화 등

처음에 Google Java Format을 적용했다가 **들여쓰기 충돌**이 발생했다. Google은 2 space, 가이드라인은 4 space. Eclipse JDT 포맷터로 전환하여 4 space + 120자 라인 제한을 맞췄다.

교훈: 자동화 도구의 결과를 **맹신하지 말 것**. 의견서/문서화가 감리 대응에서 가장 강력한 무기였다.

---

## 숫자로 보는 프로젝트

| 항목 | 수치 |
|------|------|
| 총 커밋 수 | 621개 |
| 내 커밋 수 | 509개 (82%) |
| 프로젝트 기간 | 7개월 (2025.08 ~ 2026.03) |
| Java 파일 수 | 295+ |
| 보안 취약점 조치 | CWE 6개 유형 |
| 코딩 가이드 검출 | 2,851건 (처리 완료) |
| API 그룹 | 10개+ (Swagger 기준) |

---

## 마무리

이 프로젝트에서 가장 크게 성장한 부분은 **보안 의식**이다. CWE 코드를 실제로 찾아보고, 내 코드에 어떤 취약점이 있는지 분석하고, 하나씩 조치하는 과정이 이론으로 배운 것과는 차원이 달랐다. 특히 `e.getMessage()`를 그냥 반환하는 것이 얼마나 위험한지, SecureLogUtil을 만들면서 체감했다.

두 번째는 **감리/검수 대응 능력**이다. 자동화 도구의 결과를 분석하고, 오검출을 근거와 함께 문서화하는 것이 실무에서 매우 중요하다는 걸 배웠다. 2,851건이라는 숫자에 압도당하지 않고, 체계적으로 분류하고 우선순위를 매기는 과정 자체가 성장이었다.
