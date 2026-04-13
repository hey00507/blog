---
title: "Spring Boot 프로젝트에 Custom Exception 계층 도입하기 (1/2)"
description: "단일 BusinessException + ErrorCode enum 구조의 한계를 인식하고, 도메인별 구체 예외 클래스로 계층을 확장하는 과정. 설계 판단, 마이그레이션 전략, 실제 13개 도메인 치환까지."
category: "dev"
subcategory: "project"
tags: ["spring-boot", "exception", "architecture", "refactoring", "ddd"]
pubDate: 2026-04-13T17:35:00
draft: false
series: "Custom Exception Hierarchy"
---

## 들어가며

Spring Boot 프로젝트에서 예외 처리 구조는 보통 이렇게 시작한다.

```java
public class BusinessException extends RuntimeException {
    private final ErrorCode errorCode;

    public BusinessException(ErrorCode errorCode) {
        super(errorCode.getMessage());
        this.errorCode = errorCode;
    }
}

public enum ErrorCode {
    USER_NOT_FOUND(HttpStatus.NOT_FOUND, "U001", "사용자를 찾을 수 없습니다."),
    DUPLICATE_USER(HttpStatus.CONFLICT, "U002", "이미 존재하는 사용자입니다."),
    // ... 48개 더
}
```

호출부는 이렇게 쓴다.

```java
throw new BusinessException(ErrorCode.USER_NOT_FOUND);
```

간결하고 직관적이다. 그런데 프로젝트가 커지면서 이 구조의 한계가 드러난다. 인천공항 데이터플랫폼 PoC 프로젝트에서 이 구조를 커스텀 예외 계층으로 확장했던 경험을 정리해본다. 이 글은 **1부: 설계 판단과 구체 예외 클래스 방식 도입** 까지를 다룬다. 2부에서는 이 설계를 다시 단순화하게 된 이유를 쓸 예정이다.

## 단일 `BusinessException` 구조의 한계

48개의 ErrorCode 를 쌓아놓고 한참 쓰다 보니, 다섯 가지 불편함이 누적되어 있었다.

### 1. 스택트레이스가 도메인 정보를 담지 않는다

로그에 이런 식으로만 뜬다.

```
com.zetta.airport.global.exception.BusinessException: 사용자를 찾을 수 없습니다.
    at com.zetta.airport.domain.system.user.UserService.findById(UserService.java:87)
    ...
```

메시지를 읽어야 "어떤 리소스의 not found 인지" 파악할 수 있다. 스택트레이스 클래스명이 전부 `BusinessException` 이라 로그 grep 이 효율적이지 않다.

### 2. 타입 기반 분기가 불가능하다

```java
try {
    userService.doSomething();
} catch (BusinessException e) {
    if (e.getErrorCode() == ErrorCode.USER_NOT_FOUND) {
        // ... 특수 처리
    }
}
```

예외의 타입 시스템을 활용하지 못하고 enum 값 비교로 떨어진다. 테스트에서도 마찬가지다. `assertThrows(BusinessException.class)` 가 거의 모든 케이스를 의미 없이 통과시킨다.

### 3. 호출부가 `ErrorCode` 에 결합된다

DDD 레이어 관점에서 보면, `UserService` 가 `global.exception.ErrorCode` 를 import 하는 건 껄끄럽다. 도메인이 글로벌 카탈로그를 알고 있어야 하는 구조다.

### 4. `ErrorCode` enum 이 god enum 으로 비대해진다

프로젝트의 모든 도메인의 에러 코드가 한 파일에 모인다. 새 기능 PR 마다 이 파일을 편집하게 되고, 머지 충돌의 단골 포인트가 된다.

### 5. 로깅·알람 전략을 분화하기 어렵다

- 사용자가 잘못 입력한 중복 가입 시도 → `log.warn`
- 외부 API 장애로 파일 업로드 실패 → `log.error` + 알람

둘 다 `BusinessException` 이라 `GlobalExceptionHandler` 에서 일괄 처리된다. 서비스 장애와 사용자 오류가 같은 레벨에 찍힌다.

## 3계층 예외 구조 설계

문제가 정리되면 해법은 의외로 비슷하게 수렴한다. 예외의 **의미를 타입으로 표현** 하는 것이다.

```
RuntimeException
 └── AirportException (abstract, 루트)
       ├── BusinessException (4xx — 사용자/규칙 위반)
       │     ├── NotFoundException          (404)
       │     ├── DuplicateException         (409)
       │     ├── InvalidStateException      (409 상태 충돌)
       │     └── InvalidInputException      (400 입력 검증)
       ├── AuthException            (401/403)
       └── InfrastructureException  (5xx — 시스템/외부 연동)
```

### 왜 이렇게 나누는가

**`BusinessException` vs `InfrastructureException` 분리** 가 가장 큰 가치다. 전자는 "사용자 잘못", 후자는 "시스템 잘못". `GlobalExceptionHandler` 에서 로깅 레벨과 알람 전략을 분리할 수 있다.

```java
@ExceptionHandler(BusinessException.class)
protected ResponseEntity<?> handleBusiness(BusinessException ex) {
    log.warn("BusinessException [{}]: {}",
            ex.getClass().getSimpleName(), ex.getMessage());
    // ... 4xx 응답
}

@ExceptionHandler(InfrastructureException.class)
protected ResponseEntity<?> handleInfra(InfrastructureException ex) {
    log.error("InfrastructureException [{}]: {}",
            ex.getClass().getSimpleName(), ex.getMessage(), ex);
    // ... 5xx 응답 + 향후 알람 훅
}
```

**중간 추상 클래스(`NotFoundException`, `DuplicateException`...)** 는 의미별 분류다. 같은 404 라도 "없어서 못 찾음" 과 "이미 있어서 중복" 은 코드에서 구분하고 싶을 때가 있다.

### 도메인별 구체 예외 클래스

중간 추상만 두면 호출부가 여전히 `ErrorCode` 를 알아야 한다. 한 발 더 나아가 **도메인별 구체 클래스** 를 만든다.

```java
package com.zetta.airport.domain.system.user.exception;

public class UserNotFoundException extends NotFoundException {

    public UserNotFoundException(Long userId) {
        super(ErrorCode.USER_NOT_FOUND, "사용자를 찾을 수 없습니다. id=" + userId);
    }

    public UserNotFoundException(String loginId) {
        super(ErrorCode.USER_NOT_FOUND, "사용자를 찾을 수 없습니다. loginId=" + loginId);
    }
}
```

호출부가 달라진다.

```java
// Before
throw new BusinessException(ErrorCode.USER_NOT_FOUND);

// After
throw new UserNotFoundException(userId);
```

이점이 생긴다:

- 스택트레이스에 `UserNotFoundException` 이 찍힌다 → 로그만 봐도 도메인 파악 가능
- 호출부가 `ErrorCode` 를 몰라도 된다 → DDD 레이어 순수성 향상
- 테스트가 정밀해진다: `assertThatThrownBy(...).isInstanceOf(UserNotFoundException.class)`
- 도메인별로 파일이 분리되어 `domain/{도메인}/exception/` 에 위치 → 도메인 응집도

### 배치 규칙

| 계층 | 위치 | 예시 |
|------|------|------|
| 루트 + 공통 중간 추상 | `global/exception/` | `AirportException`, `BusinessException`, `NotFoundException` |
| 도메인별 구체 예외 | `domain/{도메인}/exception/` | `UserNotFoundException`, `DuplicateUserException` |
| `ErrorCode` | `global/exception/` (유지) | 단일 파일, 도메인별 섹션 주석으로 구분 |

## 마이그레이션 전략

계층 구조를 정하는 것보다 **기존 코드를 깨뜨리지 않고 옮기는 것** 이 더 어렵다.

기존 `BusinessException` 을 건드리지 않는 3단계 전략을 세웠다.

### PR 1 — 골격만 추가, 기존 코드 0줄 수정

```java
// 기존 BusinessException 을 그대로 두되 AirportException 을 상속하게
public class BusinessException extends AirportException {
    public BusinessException(ErrorCode errorCode) { super(errorCode); }
    public BusinessException(ErrorCode errorCode, String message) { super(errorCode, message); }
}
```

새 중간 클래스들(`NotFoundException`, `DuplicateException` 등) 을 추가하고, `GlobalExceptionHandler` 에 새 핸들러들을 추가한다. 기존 `throw new BusinessException(ErrorCode.X)` 호출부는 **그대로 동작** 한다. 이 PR 은 순수하게 **추가만** 한다.

### PR 2~N — 도메인 단위 일괄 치환

한 PR 에 한 도메인씩. `UserService` 의 모든 `new BusinessException(ErrorCode.USER_NOT_FOUND)` 를 `new UserNotFoundException(userId)` 로 교체한다.

순서가 중요하다. **활발히 개발 중인 도메인을 마지막** 으로. 머지 충돌을 최소화하는 요령이다. 우리 프로젝트는 이 순서로 진행했다.

1. `mypage`, `log` — 변경 적음
2. `file`, `code`
3. `board`, `catalog`, `request`
4. `auth`, `user`, `role`, `menu` — 핵심, 변경 빈번

### PR Final — 호환용 코드 제거

모든 도메인 치환이 끝나면, `BusinessException` 을 **abstract 로 전환** 한다.

```java
public abstract class BusinessException extends AirportException {
    protected BusinessException(ErrorCode errorCode) { super(errorCode); }
    // ...
}
```

`new BusinessException(...)` 직접 호출이 컴파일 시점에 차단된다. 새 코드에서 실수로 옛 패턴을 쓰면 빌드가 실패한다.

여기에 CI 에 **회귀 방지 guard** 까지 추가하면 3중 방어선이 완성된다.

```yaml
- name: Forbidden exception patterns guard
  run: |
    if grep -rn "new BusinessException(" src/main/java; then
      echo "❌ BusinessException 은 abstract 입니다. 구체 서브클래스를 사용하세요." >&2
      exit 1
    fi
```

- 컴파일러가 한 번 잡고
- grep guard 가 두 번째로 잡고
- 코드 리뷰가 세 번째로 잡는다

## 실행: 첫 4개 도메인 치환

전략이 정해지면 실행은 기계적이다. 도메인 하나당 보통 이런 크기의 PR 이 나온다.

### mypage 도메인 (가장 작은 도메인, 2건 치환)

**치환할 파일**: `MypageService.java` 의 2곳

```java
// Before
Favorite favorite = favoriteRepository
        .findByUserIdAndReferenceTypeAndReferenceId(userId, referenceType, referenceId)
        .orElseThrow(() -> new BusinessException(ErrorCode.ENTITY_NOT_FOUND));
```

**추가할 클래스**:

```java
// domain/support/mypage/exception/FavoriteNotFoundException.java
public class FavoriteNotFoundException extends NotFoundException {
    public FavoriteNotFoundException(Long favoriteId) {
        super(ErrorCode.FAVORITE_NOT_FOUND, "즐겨찾기를 찾을 수 없습니다. id=" + favoriteId);
    }

    public FavoriteNotFoundException(String userId, String refType, Long refId) {
        super(ErrorCode.FAVORITE_NOT_FOUND,
                "즐겨찾기를 찾을 수 없습니다. userId=" + userId
                        + ", refType=" + refType + ", refId=" + refId);
    }
}
```

```java
// After
Favorite favorite = favoriteRepository
        .findByUserIdAndReferenceTypeAndReferenceId(userId, referenceType, referenceId)
        .orElseThrow(() -> new FavoriteNotFoundException(userId, referenceType, referenceId));
```

여기에 놀라운 부수 효과가 있었다. **기존 코드는 `ENTITY_NOT_FOUND` 라는 generic 코드를 쓰고 있었는데**, `ErrorCode` enum 에는 이미 `FAVORITE_NOT_FOUND(M001)` 이 정의되어 있었다. 구체 예외 클래스를 만들면서 "어느 ErrorCode 를 매핑해야 하지?" 를 한 번 더 생각하게 되고, 그 과정에서 **기존의 부정확한 매핑이 자연스럽게 교정** 되었다.

`ENTITY_NOT_FOUND` (generic) → `FAVORITE_NOT_FOUND` (specific). HTTP 상태는 똑같은 404 지만, FE 가 받는 에러 코드가 도메인 특화 값으로 바뀌어 구분이 가능해졌다.

### file 도메인 (10건, 가장 큰 치환)

file 도메인은 특이하게 세 가지 카테고리가 섞여 있었다.

| 시나리오 | 기존 | 새 클래스 | 상속 |
|----------|------|-----------|------|
| 파일 조회 실패 (5건) | `FILE_NOT_FOUND` | `FileNotFoundException` | `NotFoundException` |
| IOException / 경로 traversal (2건) | `FILE_UPLOAD_FAILED` | `FileUploadException` | `InfrastructureException` |
| 빈 파일 업로드 (1건) | `INVALID_INPUT_VALUE` | `EmptyFileException` | `InvalidInputException` |
| 확장자 검증 실패 (2건) | `FILE_UPLOAD_FAILED` | `FileUploadException` | `InfrastructureException` |

마지막 두 개 — **확장자 검증이 500 Internal Server Error 로 응답되고 있었다**. 사용자가 `malware.exe` 를 업로드하려 하면 서버가 "내 잘못" 이라고 말하는 셈이다. 의미상 400 Bad Request 가 맞다.

하지만 치환 PR 에서는 **기존 동작을 보존** 했다. 리팩터링 PR 에 버그 수정을 섞으면 리뷰어가 "이 동작 변경은 의도된 건가?" 를 판단하기 어려워진다. 대신 코드에 TODO 주석을 남기고 follow-up 이슈로 분리했다.

```java
// NOTE: 확장자 검증 실패는 의미상 입력값 오류(400)지만,
// 현재 FILE_UPLOAD_FAILED(500)로 응답하는 기존 동작을 보존한다.
// HTTP 상태 정정은 별도 이슈에서 ErrorCode 추가와 함께 진행.
if (DANGEROUS_EXTENSIONS.contains(extension.toLowerCase())) {
    throw new FileUploadException("허용되지 않는 확장자입니다: " + extension);
}
```

**치환은 행동을 바꾸지 않는다** 가 원칙이다. 부수 교정은 별건.

### code 도메인 (4건 + 부수 패키지 정리)

code 도메인을 치환하러 들어갔다가 이상한 걸 발견했다. `CodeService.java` 가 **파일은 `domain/system/code/` 에 있는데 패키지 선언은 `com.zetta.airport.domain.code`** 였다. Java 컴파일러가 이걸 에러로 잡지 않는다는 걸 이 순간에 알았다. 패키지 선언이 우선이라, 디렉토리와 불일치해도 빌드는 정상이다.

`menu`, `role`, `user` 는 모두 `domain/system/*` 인데 `code` 만 튀어 있었다. 불완전한 패키지 이동의 흔적.

이것도 follow-up 이슈로 분리하고 **먼저 구조부터 정리** 한 뒤 예외 치환을 진행했다. 같은 파일을 두 PR 에서 연달아 건드리면 리뷰어가 피곤해진다.

## 중간 점검

여기까지 오면 4개 도메인(mypage, file, code, board) 이 새 구조로 바뀌어 있다. 파일 수를 세어보면:

- 새 예외 계층 골격: `global/exception/` 8개 파일 추가
- 도메인별 구체 클래스: mypage 2 + file 3 + code 3 + board 3 = **11개 추가**
- 치환된 서비스 호출부: 약 20건
- 테스트 assertion 정밀화: 약 25개

그리고 남은 도메인은 catalog, request, auth, user, role, menu. 여기에 나중에 발견한 governance(9건), sample(4건) 까지 합치면 **앞으로 25~35개의 구체 예외 클래스가 더 생길 예정** 이었다.

이 시점에서 한 가지 질문이 떠올랐다.

> "도메인별로 구체 예외 클래스가 이렇게 많은 게 정말 맞는 구조일까?"

각 클래스는 `super(ErrorCode.X, "...")` 한 줄짜리다. `new FavoriteNotFoundException(userId, refType, refId)` 라고 호출하는 것과 `new NotFoundException(ErrorCode.FAVORITE_NOT_FOUND, "...")` 라고 호출하는 것의 차이는 **클래스 이름뿐** 이다.

그리고 솔직히 말하면, 이 프로젝트에서 **타입 기반 catch 를 사용하는 코드가 단 한 줄도 없었다**. `GlobalExceptionHandler` 가 `BusinessException`, `AuthException`, `InfrastructureException` 세 가지 중간 클래스로만 분기하고, 그걸로 끝이었다.

## 다음 글에서

지금까지의 여정은 교과서적인 "계층 설계 → 단계적 마이그레이션" 이야기다. 대부분의 블로그 글이 여기서 멈춘다.

하지만 이 세션은 여기서 끝나지 않았다. 4개 도메인을 치환한 뒤 설계 자체를 의심하고, **도메인별 구체 클래스를 전부 삭제하는 쪽으로 궤도 수정** 했다. 결과적으로 11개 파일이 삭제되고 -156 라인 순감했다.

2부에서는:

- 왜 방향을 바꿨는지 — 가치/비용 분석
- `new BusinessException(...)` 을 다시 쓰는 방향인데 어떻게 스택트레이스 가독성을 지켰는지
- 중간 클래스를 non-abstract 로 바꾸고 `(ErrorCode, String detail)` 생성자 패턴
- "이미 한 작업을 되돌린다" 는 결정을 내리는 타이밍

**다음 글**: "도메인별 구체 예외 클래스, 정말 필요할까? (2/2)"

---

## 1부 요약

- 단일 `BusinessException` 구조는 4~5가지 고질적 한계가 있다 (스택트레이스, 타입 분기, 결합, god enum, 로깅 분화)
- 3계층 구조(루트 / BusinessException·AuthException·InfrastructureException / 도메인 구체) 로 해결 가능
- 마이그레이션은 3단계(골격 추가 → 도메인 일괄 치환 → abstract 전환) 로 기존 코드를 깨지 않고 점진적 이행
- 치환 PR 에서는 **행동을 바꾸지 않는다** — 부수 버그 발견은 follow-up 이슈로 분리
- CI + 컴파일러 + 리뷰의 3중 방어선으로 회귀를 막는다
- 하지만 4개 도메인까지 오고 나면 **이 구조가 정말 ROI 에 맞나?** 라는 질문이 생긴다 → 2부로 이어짐
