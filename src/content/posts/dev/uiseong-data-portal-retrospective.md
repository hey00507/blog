---
title: "의성데이터포털 기술 회고 — 보안, 아키텍처, 코드 품질의 실전 교훈"
description: "7개월간 백엔드를 구축하며 겪은 기술 선택, 보안 취약점 대응, 코딩 가이드라인 적용 과정에서 배운 8가지 실전 교훈을 정리했다."
category: dev
subcategory: work
tags: ["spring-boot", "java", "security", "jpa", "retrospective", "cwe"]
pubDate: 2026-02-01T14:30:00
series: "프로젝트 회고"
---

의성데이터포털 백엔드 개발이 마무리되었다. 2025년 8월부터 약 6개월간, 0에서 시작해서 보안 점검과 감리까지 통과했다. 프로젝트가 끝난 지금, 기술적으로 고민했던 지점들을 정리해둔다.

---

## 1. Mybatis vs JPA — 프로젝트 초기의 기술 선택

기존에 Mybatis가 설정되어 있었지만, 데이터 거버넌스 도메인은 표준사전(용어, 단어, 도메인, 코드) 같은 **도메인 객체 중심**의 CRUD가 많았다.

Mybatis를 제거하고 JPA로 전환했다.

- 표준사전 4종의 CRUD는 `JpaRepository`로 대부분 커버 가능
- Entity 변경 시 DDL 자동 반영(`hibernate.ddl-auto: update`)으로 초기 개발 속도 확보
- 도메인 객체에 비즈니스 로직을 넣는 DDD 스타일이 데이터 거버넌스에 자연스러움
- 복잡한 통계/조회는 Native Query로 보완

**배운 점:**
- JPA의 `@Entity` 설계와 DB 스키마 설계는 **동시에** 진행해야 한다. 나중에 맞추려면 고통스럽다.
- 복합키(`@IdClass`)는 JPA에서 관리가 번거롭다. AutoGenerate 단일 PK + Repository 유니크 검증이 실용적이다.
- `hibernate.ddl-auto: update`는 개발용. 프로덕션은 반드시 `validate`로.

---

## 2. 통합 응답 체계 — ResultEntity

각 API가 서로 다른 형태로 응답하면 프론트엔드 파싱이 지옥이 된다. 제네릭 `ResultEntity<T>`를 만들어 모든 API의 응답을 통일했다.

```java
// 성공: { success: true, code: 200, data: {...} }
// 실패: { success: false, code: 400, message: "...", errors: [...] }
// 부분 성공: { success: true, code: 206, message: "3건 중 2건 삭제" }
```

설계 포인트:
- **정적 팩토리 메서드** — `ResultEntity.success(data)`, `ResultEntity.error(msg)`. new를 직접 쓸 일이 없다.
- **206 Partial Content** — 일괄 삭제에서 일부만 성공한 경우. 200이면 "왜 일부만?"을 알 수 없고, 400이면 "성공한 건?"이 모호해진다.
- **FieldError 목록** — `@Valid` 검증 실패 시 어떤 필드가 왜 실패했는지 구체적으로 전달.

**배운 점:** 통합 응답 객체는 **프로젝트 초기**에 만들어야 한다. 나중에 도입하면 기존 API 전부 수정해야 한다.

---

## 3. 보안 — 실전에서 배운 CWE 대응

### CWE-209: 오류 메시지 정보 노출

가장 많이 수정한 취약점이다. `e.getMessage()`를 그대로 응답에 담으면 DB 경로, 쿼리, 서버 경로가 다 노출된다.

`SecureLogUtil`을 만들어 해결했다.

```java
public static String getSafeMessage(Exception ex) {
    String errorId = generateErrorId(); // UUID 8자리
    if (PROD_PROFILE.equals(profile)) {
        return String.format("오류가 발생했습니다. (에러ID: %s)", errorId);
    }
    return maskSensitiveData(ex.getMessage());
}
```

마스킹은 정규식으로 파일 경로, DB 정보, IP, 이메일을 자동으로 잡아낸다.

```java
result = FILE_PATH_PATTERN.matcher(result).replaceAll("[PATH]");
result = DB_INFO_PATTERN.matcher(result).replaceAll("[DB_INFO]");
result = IP_PATTERN.matcher(result).replaceAll("[IP]");
result = EMAIL_PATTERN.matcher(result).replaceAll("[EMAIL]");
```

프로덕션에서는 에러 ID만 반환하고, 서버 로그에서 해당 ID로 역추적한다. 디버깅과 보안을 동시에 잡는 패턴이다.

### CWE-307: 무차별 대입 공격

로그인 API에 Rate Limiting이 없으면 무한 시도가 가능하다.

**IP 기반 vs Username 기반** — 이게 핵심 결정이었다.
- Username 기반이면 공격자가 타인의 계정을 의도적으로 잠글 수 있다 (DoS).
- **IP 기반**이면 공격자 자신만 차단된다. 다만 공유 IP(회사 NAT) 환경에서의 trade-off는 인지하고 있다.

```java
// ConcurrentHashMap.compute() — synchronized 없이 원자적 업데이트
attemptCache.compute(ipAddress, (key, info) -> {
    if (info == null) return new LoginAttemptInfo();
    info.incrementAttempts();
    if (info.getAttempts() > MAX_ATTEMPTS && !info.isBlocked()) {
        info.block(LocalDateTime.now().plusMinutes(BLOCK_DURATION_MINUTES));
    }
    return info;
});
```

`ConcurrentHashMap.compute()`는 멀티스레드 환경에서 `synchronized` 없이도 race condition을 방지한다. 알아두면 유용한 패턴이다.

### 파일 업로드 — 3중 방어

1. **확장자 블랙리스트** (exe, php, jsp 등 40종+)
2. **확장자 화이트리스트** (csv, json, xml만 허용)
3. **파일 내용 파싱 검증** (CSV Injection, XXE 공격 방지)

블랙리스트만으로는 부족하다. 새로운 위험한 확장자가 나올 수 있기 때문에 화이트리스트와 반드시 병행해야 한다.

XML은 XXE 공격 방지가 필수다.

```java
DocumentBuilderFactory factory = DocumentBuilderFactory.newInstance();
factory.setFeature("http://apache.org/xml/features/disallow-doctype-decl", true);
factory.setFeature("http://xml.org/sax/features/external-general-entities", false);
factory.setFeature("http://xml.org/sax/features/external-parameter-entities", false);
factory.setXIncludeAware(false);
factory.setExpandEntityReferences(false);
```

---

## 4. 개인정보 마스킹 — 케이스별 전략

하나의 마스킹 규칙으로는 안 된다. 관리자 화면, 일반 사용자 화면, 엑셀 다운로드, 접속 로그에서 각각 다른 수준의 마스킹이 필요했다.

| 데이터 | 일반 조회 | 관리자 조회 | 엑셀 다운로드 |
|--------|----------|------------|------------|
| 이메일 | `te**@email.com` | 원본 | 암호화된 값 |
| 전화번호 | `010****5678` | 원본 | 암호화된 값 |
| 이름 | `홍*동` | 원본 | 암호화된 값 |
| 사용자 ID | `te****er` | 원본 | 원본 |

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

**배운 점:** 마스킹은 **어디서 하느냐**가 중요하다. Entity 레벨에서 하면 관리자도 볼 수 없게 된다. Response DTO 레벨에서 해야 유연하게 제어할 수 있다.

---

## 5. DB 커넥션 풀 — 주말의 함정

월요일 아침에 API가 먹통이 되는 현상이 있었다. 주말 동안 트래픽이 0이면 DB 커넥션이 전부 끊어지고, 월요일에 새 커넥션을 만드는 데 시간이 걸렸다.

HikariCP의 `keepaliveTime`을 5분으로 설정해서 해결했다.

```yaml
keepalive-time: 300000  # 5분마다 keepalive
minimum-idle: 5         # 최소 5개 커넥션 유지
```

**배운 점:**
- `idleTimeout`만 설정하면 커넥션이 살아는 있지만, DB 측에서 끊을 수 있다.
- `keepaliveTime`은 **클라이언트(앱) 측에서** 능동적으로 커넥션을 검증하는 것이다.
- `leakDetectionThreshold` (60초)도 설정해서, 커넥션 누수를 조기에 감지하자.

---

## 6. 코딩 가이드라인 — 자동화의 한계

TTAK.KO-11.0183 국가 표준 기반 코딩 가이드라인을 전체에 적용해야 했다. 검출 도구가 **2,851건**을 뱉었다.

접근 방식:
1. **자동 수정 가능한 것 먼저** — Spotless(Eclipse JDT)로 들여쓰기, import 정렬, 라인 길이 일괄 처리
2. **카테고리별 샘플링** — 중 시급도 1,165건을 전수 조사했더니 **696건이 거짓 양성**
3. **오검출 의견서 작성** — "왜 이것이 위반이 아닌지"를 근거와 함께 문서화
4. **실제 위반만 수정** — 매직 넘버 상수화, 빈 catch 블록 처리, Exception 구체화 등

처음에 Google Java Format을 적용했다가 들여쓰기 충돌이 발생했다. Google은 2 space, 가이드라인은 4 space. Eclipse JDT 포맷터로 전환해서 해결.

**배운 점:**
- 자동화 도구의 결과를 **맹신하지 말 것** — 거짓 양성률이 높을 수 있다.
- 의견서/문서화가 감리 대응에서 **가장 강력한 무기**였다.
- Spotless로 할 수 있는 것(포맷)과 할 수 없는 것(의미 규칙)을 명확히 구분해야 한다.

---

## 7. AOP 로깅 — 관심사 분리의 실전

모든 API에 접속 로그를 남겨야 하는데, 각 Controller에 로깅 코드를 넣으면 중복이 심하고, 빠뜨리기 쉽다.

`@Around` 어드바이스로 모든 `@RestController` 메서드를 감싸는 AOP Aspect를 구현했다.

수집하는 정보:
- 클라이언트 IP (IPv6 → IPv4 변환 포함)
- 브라우저 종류 (User-Agent 파싱)
- JWT에서 사용자 정보 추출
- `@Operation` 어노테이션에서 API 설명 자동 추출
- 요청 파라미터 + 바디 (200자 truncate)
- 성공/실패 여부 + 에러 메시지 (SecureLogUtil 마스킹)

**배운 점:**
- AOP는 Cross-cutting Concern의 교과서적 해결책이다 — 로깅, 인증, 트랜잭션.
- `@Around`가 `@Before` + `@After`보다 유연하다. 실행 전후 + 예외 모두 핸들링 가능.
- Swagger의 `@Operation` 어노테이션을 로깅에도 활용하면 **문서화와 로깅이 자연스럽게 동기화**된다. 이건 진짜 좋은 패턴이다.

---

## 8. 암호화 — 양방향 vs 단방향의 구분

설계 원칙은 단순하다.
- **비밀번호** → SHA (단방향). 복호화할 이유가 없다.
- **이름, 이메일, 전화번호** → AES (양방향). 관리자가 원본을 봐야 하므로.
- **사용자 ID** → 상황에 따라 마스킹만 (암호화 안 함). 로그인에 사용되므로.

CubeOneAPI 연동에서의 삽질:
- 네이티브 라이브러리(`.so`) 경로 문제로 Swagger 초기화 시 오류
- WAR 패키징에 JAR 포함시키는 Gradle 설정 필요
- 이중 해시 문제 — HashConverter가 이미 해시된 값을 다시 해시하는 버그

**배운 점:**
- 암호화 레이어는 **JPA Converter**로 구현하면 Entity 코드가 깔끔하다. `@Convert(converter = CryptoConverter.class)` 한 줄이면 끝.
- 하지만 Converter에서 예외가 나면 디버깅이 매우 어렵다. 충분한 로깅이 필수.
- 환경별(dev/prod) 라이브러리 경로 설정을 빼먹으면 배포할 때 터진다.

---

## 마무리

이 프로젝트에서 가장 크게 성장한 부분은 **보안 의식**이다. CWE 코드를 실제로 찾아보고, 내 코드에 어떤 취약점이 있는지 분석하고, 하나씩 조치하는 과정이 이론으로 배운 것과는 차원이 달랐다. 특히 `e.getMessage()`를 그냥 반환하는 것이 얼마나 위험한지, SecureLogUtil을 만들면서 체감했다.

두 번째는 **감리/검수 대응 능력**이다. 자동화 도구의 결과를 분석하고, 오검출을 근거와 함께 문서화하는 것이 실무에서 매우 중요하다는 걸 배웠다. 2,851건이라는 숫자에 압도당하지 않고, 체계적으로 분류하고 우선순위를 매기는 과정 자체가 성장이었다.

다음 프로젝트에서는 Rate Limiter를 Redis 기반으로 분산 환경에서도 동작하도록 개선하고, Circuit Breaker(Resilience4j)를 외부 API 호출에 적용해보고 싶다.
