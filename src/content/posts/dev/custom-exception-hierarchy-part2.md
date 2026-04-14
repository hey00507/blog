---
title: "도메인별 구체 예외 클래스, 정말 필요할까? (2/2)"
description: "도메인별 구체 예외 클래스 11개를 만들어 놓고 다시 지운 이야기. 가치/비용 분석, 중간 클래스 non-abstract 전환, `(ErrorCode, detail)` 생성자 패턴, 그리고 이미 한 작업을 되돌리는 결정의 타이밍."
category: "dev"
subcategory: "project"
tags: ["spring-boot", "exception", "architecture", "refactoring", "ddd"]
pubDate: 2026-04-14T20:53:01
draft: false
series: "Custom Exception Hierarchy"
---

## 다시 돌아와서

[1부](/dev/project/custom-exception-hierarchy-part1) 끝에서 던진 질문은 이것이었다.

> "도메인별로 구체 예외 클래스가 이렇게 많은 게 정말 맞는 구조일까?"

4개 도메인(mypage, file, code, board)을 치환한 뒤, 한발 물러서서 지금까지 만든 것과 앞으로 만들 것을 나란히 놓고 보니 균형이 맞지 않았다. 이 글은 그 다음에 내린 판단 — **도메인별 구체 클래스 11개를 다시 삭제** 한 과정이다.

## 가치/비용 재검토

### 얻은 것

| 항목 | 실제 가치 |
|------|----------|
| 스택트레이스에 도메인 클래스명 | ✅ 로그에서 확인됨 |
| 호출부가 `ErrorCode` 를 몰라도 됨 | ⚠️ 어차피 생성자에 `ErrorCode.X`가 숨어 있음 |
| 타입 기반 catch | ❌ 프로젝트 전체에 한 곳도 없음 |
| 테스트 assertion 정밀화 | ⚠️ `isInstanceOf(NotFoundException)` 으로도 충분 |
| 도메인별 파일 분리 | ✅ 유일하게 명확한 가치 |

### 치른 비용

- **구체 클래스 1개당 파일 1개** — 4개 도메인에서 11개, 남은 도메인까지 하면 30~40개 예정
- 생성자는 대부분 `super(ErrorCode.X, "... id=" + id)` 한 줄짜리. **의미 있는 로직이 없음**
- PR 마다 새 도메인에 치환할 때 같은 패턴을 기계적으로 반복
- 클래스 이름을 짓기 위한 의미 없는 인지 부하 — `UserNotFoundException` vs `UserNotExistsException` vs `MemberNotFoundException`

### 핵심 관찰

얻은 것 중 실제로 작동하는 가치는 **스택트레이스 가독성** 하나뿐이었다. 나머지는 이론적으로는 좋지만 이 프로젝트에서 쓰지 않는다. 그리고 스택트레이스는 **클래스 이름만** 문제지, 클래스 자체가 30개씩 필요한 게 아니다.

## 더 단순한 대안

중간 추상 클래스(`NotFoundException`, `DuplicateException`, `InvalidStateException`, `InvalidInputException`)를 **non-abstract 로 전환** 하고, `(ErrorCode, String detail)` 생성자를 추가한다. 그리고 호출부에서 직접 쓴다.

```java
// Before (구체 예외 클래스 방식)
throw new FavoriteNotFoundException(userId, refType, refId);

// After (중간 클래스 + detail 직접 사용)
throw new NotFoundException(
        ErrorCode.FAVORITE_NOT_FOUND,
        "즐겨찾기를 찾을 수 없습니다. userId=" + userId
                + ", refType=" + refType + ", refId=" + refId);
```

### 이게 왜 충분한가

**1. 스택트레이스는 여전히 의미 있다**

```
com.zetta.airport.global.exception.NotFoundException: 즐겨찾기를 찾을 수 없습니다. userId=42, refType=POST, refId=100
    at com.zetta.airport.domain.support.mypage.MypageService.removeFavorite(MypageService.java:73)
```

- 클래스명 `NotFoundException` → "리소스 없음 계열" 이라는 의미 분류 유지
- 메시지 `즐겨찾기를 찾을 수 없습니다. ...` → 어느 도메인의 어느 리소스인지 즉시 파악
- `at MypageService.removeFavorite` → 호출 위치가 도메인 정보를 이미 담고 있음

1부에서 지적한 "로그에 `BusinessException` 만 뜬다" 문제의 본질은 "중간 클래스조차 없었다" 였지, "도메인별 구체 클래스가 없었다" 가 아니었다.

**2. `GlobalExceptionHandler` 는 그대로 작동**

```java
@ExceptionHandler(BusinessException.class)      // 4xx
@ExceptionHandler(AuthException.class)           // 401/403
@ExceptionHandler(InfrastructureException.class) // 5xx
```

이 3갈래 분기로 프로젝트 전체가 돌아간다. 구체 클래스가 있든 없든 핸들러가 받는 것은 똑같이 `BusinessException` 의 서브타입이다.

**3. 테스트도 문제없음**

```java
assertThatThrownBy(() -> mypageService.removeFavorite(...))
        .isInstanceOf(NotFoundException.class)
        .hasMessageContaining("즐겨찾기");
```

클래스 + 메시지 substring 만으로 충분히 정밀하다. "정확히 `FavoriteNotFoundException` 이어야 한다" 같은 테스트는 쓸 일이 없다.

## 되돌리기 — PR 역순 전략

이미 머지된 PR 들을 되돌리는 건 쉽지 않다. 혀를 차면서 작업을 시작했다.

### 단계

1. `NotFoundException`, `DuplicateException`, `InvalidStateException`, `InvalidInputException` 에 `(ErrorCode, String detail)` 생성자 추가
2. 중간 클래스들에서 `abstract` 키워드 제거
3. **이미 치환된 4개 도메인 역치환** — `new FavoriteNotFoundException(...)` → `new NotFoundException(ErrorCode.FAVORITE_NOT_FOUND, "...")`
4. 도메인별 구체 클래스 11개 파일 **삭제**
5. import 정리, 테스트 assertion 조정

### 결과 수치

- 삭제된 파일: **11개**
- 순 라인 수: **-156**
- 치환된 호출부: 약 20건
- 관련 테스트 수정: 약 25개

### 가장 까다로웠던 부분

**"이미 한 작업을 되돌린다" 는 심리적 저항**. 사람이 내리는 대부분의 결정은 sunk cost 에 끌려간다. "이만큼 했는데" 가 "이게 정말 맞나" 를 누른다.

이번에는 운 좋게 4개 도메인에서 멈출 수 있었다. 이 시점이 **되돌리기 비용 < 유지 비용** 이 되는 마지막 구간이었다. 10개 도메인까지 갔다면 역치환 자체가 새로운 대공사가 되었을 것이고, 아마 그냥 밀고 나갔을 것이다.

## 결과적으로 남은 구조

```
RuntimeException
 └── AirportException (abstract)
       ├── BusinessException (abstract, 4xx 상위 분류)
       │     ├── NotFoundException          (non-abstract)
       │     ├── DuplicateException         (non-abstract)
       │     ├── InvalidStateException      (non-abstract)
       │     └── InvalidInputException      (non-abstract)
       ├── AuthException            (non-abstract, 401/403)
       └── InfrastructureException  (non-abstract, 5xx)
```

사용 패턴도 일관된다.

```java
// NotFound 계열
throw new NotFoundException(ErrorCode.USER_NOT_FOUND, "userId=" + userId);

// 중복 계열
throw new DuplicateException(ErrorCode.DUPLICATE_USER, "loginId=" + loginId);

// 상태 충돌
throw new InvalidStateException(ErrorCode.ORDER_ALREADY_SHIPPED, "orderId=" + orderId);

// 입력 검증
throw new InvalidInputException(ErrorCode.INVALID_DATE_RANGE, "from=" + from + ", to=" + to);

// 인증/인가
throw new AuthException(ErrorCode.ACCESS_DENIED, "role=" + currentRole);

// 시스템/외부 연동
throw new InfrastructureException(ErrorCode.FILE_UPLOAD_FAILED, "path=" + path, ioException);
```

## 배운 것

**1. 계층 설계는 "쓸 일이 있을 때" 까지만 만든다**

"나중에 타입 기반 catch 가 필요해질 수 있으니 미리 준비해두자" 는 거의 항상 과설계다. 필요해졌을 때 구체 클래스를 만들어도 늦지 않다. 호출부는 여전히 `(ErrorCode, detail)` 생성자를 받으므로 서브클래스 도입이 호환성을 깨지 않는다.

**2. "한 줄짜리 클래스" 는 신호다**

클래스 안의 로직이 `super(...)` 호출 한 줄이라면, 그 클래스는 대부분 **이름을 붙이기 위한 껍데기** 다. 이름이 필요하다면 enum 값(`ErrorCode.USER_NOT_FOUND`)이 이미 그 역할을 하고 있는지 먼저 확인한다.

**3. 스택트레이스 가독성의 본질은 "의미 분류 + 메시지"**

도메인별로 클래스가 다를 필요는 없다. `NotFoundException` + 좋은 메시지가 `UserNotFoundException` + 뻔한 메시지보다 더 많은 정보를 준다. 메시지를 잘 쓰는 것에 투자하는 편이 낫다.

**4. 마이그레이션 중간에 방향 전환이 가능한 시점은 짧다**

4개 도메인까지는 역치환이 "하루 작업" 으로 가능했다. 만약 이걸 PR final 단계(BusinessException abstract 전환)까지 밀어붙인 뒤에 되돌리려 했다면, 그건 새 대형 리팩토링 프로젝트였을 것이다. **중간 점검 타이밍이 중요** 하다.

**5. "이미 한 작업" 을 되돌리는 건 기술 문제가 아니라 심리 문제**

sunk cost 를 버리는 훈련. "어제의 나는 이 구조가 맞다고 생각했지만, 오늘의 나는 더 많은 정보를 가지고 있다" 를 스스로에게 허용할 수 있어야 한다.

## 마치며

예외 계층 설계는 **"타입 시스템을 얼마나 활용할 것인가"** 의 스펙트럼에서 선택하는 문제다. 극단 중 하나(단일 `BusinessException` + god enum)는 확실히 아쉽다. 하지만 반대 극단(모든 에러가 전용 클래스)이 정답인 것도 아니다.

이 프로젝트의 균형점은 **"의미 분류는 클래스로, 도메인 구분은 메시지로"** 였다. 프로젝트마다 균형점은 다를 수 있다. 타입 기반 catch 를 자주 쓰는 도메인(예: 결제, 외부 연동)이라면 구체 클래스가 정당화될 것이다. 그런 곳에서는 "필요해진 그 시점에" 서브클래스를 추가하면 된다 — 지금 이 구조가 그 확장을 막지 않는다.

---

## 2부 요약

- 구체 예외 클래스의 실제 가치는 **스택트레이스 가독성 하나** 였고, 이는 클래스가 아니라 **메시지** 로도 달성 가능
- 중간 클래스를 non-abstract 로 전환 + `(ErrorCode, String detail)` 생성자 패턴이 더 단순
- 11개 파일 삭제, -156 라인. 4개 도메인까지 진행된 시점이 되돌리기 비용이 가장 낮은 구간이었음
- 계층 설계는 **쓸 일이 있을 때** 까지만 — "언젠가 쓸 수도" 는 거의 과설계
- 마이그레이션 중간 점검을 게을리하지 말 것. 방향 전환 가능한 시점은 생각보다 짧다

---

## Related

- [1부 — Spring Boot 프로젝트에 Custom Exception 계층 도입하기](/dev/project/custom-exception-hierarchy-part1)
