---
title: "구글 시트 편집만으로 회사 홈페이지 배포하기 — 파이프라인 설계 (1/2)"
description: "Google Sheets → Apps Script → GitHub Actions → n8n → Tomcat 서버로 이어지는 무인 배포 파이프라인을 어떻게 구성했는지. 빌드 게이트, 아티팩트 전달, rsync 무중단 배포까지의 설계 판단."
category: "dev"
subcategory: "work"
tags: ["devops", "github-actions", "n8n", "tomcat", "automation", "zetta"]
pubDate: 2026-04-14T20:53:01
draft: false
series: "Zetta CMS Homepage 배포 파이프라인"
---

## 들어가며

회사 홈페이지의 콘텐츠를 수정하려면 보통 이런 흐름이 필요하다.

1. 기획자가 수정본을 작성
2. 개발자에게 전달
3. 개발자가 코드 수정 → 빌드 → 배포
4. 결과 확인

이 흐름에는 **개발자의 시간이 반드시 들어가는 구간** 이 있다. 작은 수정도 마찬가지다. 오타 하나를 고치려고 개발자 워크플로우를 한 번 거치는 건 모두에게 피곤한 일이다.

제타소프트 홈페이지는 이 흐름을 **"구글 시트를 편집하면 3~5분 후에 운영 반영"** 으로 바꿨다. 기획자가 시트만 만지면 된다. 개발자는 끼지 않는다.

이 글은 그 파이프라인을 어떻게 구성했는지, 왜 이렇게 설계했는지에 대한 기록이다. **1부에서는 전체 구조와 각 구성 요소의 역할** 을 다룬다. 2부에서는 구현하면서 실제로 부딪힌 함정들 — Tomcat `allowLinking=false` 충돌, rsync 전환, PAT 권한 분리, n8n active version 동기화 — 을 정리할 예정이다.

## 전체 구조 한 눈에

```
[1] 구글시트 편집
      │
      ▼
[2] Apps Script (편집 감지 + 60초 디바운스)
      │
      ▼
[3] GitHub main 브랜치 (시트 → cms_data.json 자동 커밋)
      │
      ▼
[4] GitHub Actions (빌드 게이트 — 실패 시 여기서 차단)
      │
      ▼
[5] publish 브랜치 (검증 통과한 코드만 fast-forward)
      │
      ▼
[6] n8n Webhook (publish push 수신)
      │
      ▼
[7] 50번 서버 rsync 배포 (Tomcat 무중단)
```

시트 편집부터 운영 반영까지 **약 3~5분**. 사람은 시트에만 개입한다.

## 각 구성 요소의 역할

### 1. 구글 스프레드시트 — 콘텐츠 소스

<img src="/images/posts/zetta-cms-pipeline-part1/03-google-sheets.jpeg" alt="Google Sheets 콘텐츠 편집 화면" style="max-width: 720px;" />

*시트 9개(설정, 홈, About, Product, Recruit, Contact, Business, 네비게이션, Footer)로 구성. C~I 열(값, 폰트, 색상 등)만 편집 대상이고 A·B 열(row, fieldId)은 고정.*

시트를 "데이터 입력 UI" 로 사용한다. 기획자가 익숙한 도구이고, 구조화된 형태로 편집할 수 있으며, 히스토리도 자동으로 쌓인다. **별도의 CMS 를 만들지 않은 가장 큰 이유** 는 이것이다.

### 2. Google Apps Script — 편집 감지기

<img src="/images/posts/zetta-cms-pipeline-part1/04-apps-script-editor.jpeg" alt="Google Apps Script 편집기" style="max-width: 720px;" />

*Apps Script 에 작성한 5개 함수 — `setupTriggers`, `onEditInstallable`, `flushDispatch`, `manualDispatch`, `showStatus`.*

Apps Script 의 역할은 단 하나 — **시트 편집을 감지해서 GitHub 에 알림을 보내는 것**. 하지만 그 사이에 두 가지 장치가 있다.

**디바운스**. 사용자는 보통 셀 여러 개를 연속으로 고친다. 편집 한 번마다 GitHub Actions 를 트리거하면 불필요한 빌드가 10번, 20번 돌아간다. 그래서 **편집 후 60초를 기다렸다가** 마지막 편집 이후 아무 움직임도 없을 때만 발사한다.

```javascript
// 의사 코드
function onEditInstallable(e) {
  // 편집 시각만 저장하고 즉시 리턴
  PropertiesService.getScriptProperties()
    .setProperty('DISPATCH_LAST_EDIT_AT', new Date().toISOString());
}

function flushDispatch() {
  // 1분마다 실행되는 크론
  const lastEdit = new Date(props.getProperty('DISPATCH_LAST_EDIT_AT'));
  const lastDispatch = new Date(props.getProperty('DISPATCH_LAST_DISPATCH_AT'));

  // 마지막 편집이 마지막 발사 이후이고, 60초가 지났으면 발사
  if (lastEdit > lastDispatch && Date.now() - lastEdit.getTime() > 60_000) {
    fireRepositoryDispatch();
    props.setProperty('DISPATCH_LAST_DISPATCH_AT', new Date().toISOString());
  }
}
```

Apps Script `onEdit` 트리거 자체에 debounce 가 내장되어 있지 않아서, **edit 시각 저장 → 별도 크론이 flush** 하는 패턴으로 분리했다. 로직이 단순해지고 상태(`lastEdit`, `lastDispatch`, `lastStatus`) 조회도 쉬워진다.

<img src="/images/posts/zetta-cms-pipeline-part1/07-apps-script-properties.jpeg" alt="Apps Script Script Properties — 토큰과 상태 저장" style="max-width: 720px;" />

*Script Properties 에 토큰(`GITHUB_TOKEN`)과 디스패치 상태(`DISPATCH_LAST_*`)를 함께 저장. 장애 시 `showStatus` 로 한눈에 확인 가능.*

### 3. GitHub Actions — 빌드 게이트

<img src="/images/posts/zetta-cms-pipeline-part1/01-github-actions-runs.jpeg" alt="GitHub Actions 실행 목록" style="max-width: 720px;" />

*`repository_dispatch: sheets-updated` 이벤트로 트리거된 run 목록. 성공/실패가 여기서 1차로 걸러진다.*

파이프라인에서 가장 중요한 장치는 **빌드 게이트** 다. Actions 워크플로우는 이 순서로 돈다.

<img src="/images/posts/zetta-cms-pipeline-part1/02-github-actions-workflow.jpeg" alt="GitHub Actions 워크플로우 파일" style="max-width: 720px;" />

| 순서 | 단계 | 의미 |
|---|---|---|
| 1 | Checkout main | 코드 베이스 준비 |
| 2 | Setup Node.js | 런타임 준비 |
| 3 | Install deps | `npm ci` |
| 4 | Generate `cms_data.json` | 시트 → JSON 직렬화 |
| 5 | Commit to main | 변경 있으면 자동 커밋 |
| 6 | **Build (gate)** | `npm run build` — 실패 시 이후 차단 |
| 7 | Upload dist artifact | `cms-dist-{sha}` 이름으로 업로드 |
| 8 | Fast-forward publish | 검증 통과분만 `publish` 브랜치로 |

**게이트의 핵심 원칙**: 빌드가 실패하면 `publish` 브랜치는 **절대 갱신되지 않는다**. 운영 서버는 `publish` 브랜치만 바라보므로, 시트가 깨져도 운영은 이전 버전을 계속 서빙한다. **사고가 전파되지 않는다** 는 게 이 구조의 핵심이다.

`publish` 브랜치에 fast-forward 만 허용하는 것도 같은 이유다. 누군가가 `publish` 에 직접 commit 하면 빌드 게이트를 우회할 수 있다. fast-forward 제약이 그걸 막는다.

### 4. 아티팩트 전달 — "한 번 빌드, 어디든 배포"

50번 서버에 Node.js 를 깔아서 거기서 빌드할 수도 있었다. 하지만 그렇게 하면:

- 50번 서버에 Node.js 버전 관리가 필요
- 빌드 환경이 서버마다 달라질 위험
- 서버 리소스 (메모리, CPU) 가 빌드에 쓰임

대신 **"GitHub Actions 에서 한 번 빌드 → 산출물을 artifact 로 업로드 → 50번 서버는 다운로드만"** 패턴을 택했다. Node.js 는 50번 서버에 깔지 않는다. Tomcat 만 있으면 된다.

```yaml
- name: Upload dist artifact
  uses: actions/upload-artifact@v4
  with:
    name: cms-dist-${{ github.sha }}
    path: dist/
    retention-days: 30
    if-no-files-found: error
```

- **이름에 SHA 포함** — n8n 이 webhook 에서 받은 커밋 SHA 로 정확한 아티팩트를 특정
- **`if-no-files-found: error`** — 빈 산출물 업로드 방지 (사고 차단)
- **`retention-days: 30`** — 한 달 간 롤백 가능

### 5. n8n — 배포 실행기

<img src="/images/posts/zetta-cms-pipeline-part1/05-n8n-deploy-workflow.jpeg" alt="n8n 배포 워크플로우 7 노드 체인" style="max-width: 720px;" />

*7 노드 구성: Webhook → Parse → Find Artifact → Get Signed URL → Extract → SSH Deploy → Smoke Test.*

n8n 은 **"push 이벤트를 받아서 50번 서버에서 배포 스크립트를 실행" 시키는 자동화 허브** 역할만 한다. 로직이 복잡하지 않으니 굳이 별도 코드 서비스를 만들지 않았다.

| 노드 | 역할 |
|---|---|
| Webhook | GitHub push 이벤트 수신 |
| Parse & Validate | `refs/heads/publish` 확인 (아니면 중단) |
| Find Artifact | GitHub API 로 `cms-dist-{sha}` 조회 |
| Get Signed URL | 302 redirect 로 pre-signed 다운로드 URL 획득 |
| Extract Signed URL | 응답 헤더에서 URL 파싱 |
| Deploy via SSH | 50번 서버에서 다운로드 + unzip + rsync |
| Smoke Test | 배포 직후 `http://192.168.0.50:8080/` 200 확인 |

**재미있는 구간은 "Get Signed URL"**. GitHub artifacts API 는 인증된 요청에 대해 302 redirect 로 Azure Blob Storage 의 pre-signed URL 을 내려준다. 이 URL 은 1분간 유효하다. `follow_redirects: false` 로 설정해서 리다이렉트를 타지 않고 Location 헤더를 직접 캡처한 뒤, 다음 노드에서 그 URL 로 다운로드한다.

이렇게 분리한 이유는 **SSH 노드에서는 PAT 을 굳이 서버에 전달하지 않기 위해서** 다. n8n 이 signed URL 만 SSH 로 넘기면, 서버 입장에서는 "짧은 시간 유효한 URL 로 zip 을 다운로드" 하는 것이고 GitHub 인증 정보는 n8n 안에만 머문다.

#### 롤백 워크플로우

<img src="/images/posts/zetta-cms-pipeline-part1/06-n8n-rollback-workflow.jpeg" alt="n8n 롤백 워크플로우" style="max-width: 720px;" />

*수동 트리거만 받는 별도 워크플로우. `targetRelease` 를 비워두면 직전 release 자동 선택.*

롤백은 **자동화하지 않는다**. "이전 버전으로 되돌리겠다" 는 결정 자체가 사람의 판단이 필요하기 때문이다. 대신 실행 자체는 원클릭으로 가능하게 해뒀다.

- `targetRelease` 비움 → `.current` 마커에 기록된 것을 제외하고 가장 최근 release 자동 선택
- `targetRelease` 지정 → 특정 release 이름(예: `20260414_100507_4db0da0`) 으로 롤백

### 6. 50번 서버 — Tomcat 무중단 배포

- **서버**: 192.168.0.50
- **WAS**: Apache Tomcat 9.0.55
- **서빙 경로**: `/var/lib/apache-tomcat-9.0.55/webapps/zs-homepage/`

배포 방식은 **rsync 무중단** 이다. Tomcat 을 내리지 않고 파일만 교체한다. 가능한 이유는 Vite 가 생성하는 **해시 파일명** 때문이다.

```
assets/
├── index-Dx3k9Qp2.js
├── index-f7a2Bm1X.css
└── logo-9aK2Np4b.png
```

파일 교체 중간에 구버전 HTML 이 신버전 JS 를 참조하거나 그 반대가 되어도, 해시가 다르므로 **물리적으로 다른 파일** 이다. 충돌하지 않는다. 이 특성 덕분에 rsync 의 부분 원자성(파일 단위 atomic rename)으로 충분하다.

#### 디렉토리 구조

```
/var/lib/apache-tomcat-9.0.55/
├── webapps/
│   └── zs-homepage/     ← 현재 서빙 대상 (rsync 로 갱신)
└── releases/
    └── zs-homepage/      ← release 히스토리 (최근 5개 보존)
        ├── 20260414_100507_xxxxxxx/
        ├── 20260414_101359_xxxxxxx/
        └── .current      ← 현재 서빙 중인 release 마커
```

- **`releases/` 는 `webapps/` 밖에 둔다** — Tomcat `autoDeploy=true` 가 `webapps/` 아래 모든 서브디렉토리를 webapp 후보로 감시하기 때문
- **최근 5개만 보존** — 6번째 배포부터 가장 오래된 것 자동 삭제
- **`.current` 마커** — 롤백 워크플로우가 "현재 제외하고 직전" 을 찾는 기준

## 설계에서 의식적으로 피한 것들

### 🚫 Kubernetes / 컨테이너

회사 홈페이지 하나 띄우는데 k8s 를 끌어오지 않는다. Tomcat + rsync 로 충분하고, 장애 포인트가 훨씬 적다.

### 🚫 blue/green 로드밸런서 전환

blue/green 을 쓰려면 로드밸런서 레이어가 필요하고, 그것도 관리 대상이 된다. **파일 교체만으로 무중단이 가능한 상황** 이라면 더 단순한 게 맞다.

### 🚫 별도 CMS 시스템

Strapi, Contentful, Sanity 같은 CMS 를 깔 수도 있었다. 하지만 그러면:

- CMS 자체를 호스팅해야 하고
- CMS 의 학습 곡선이 있고
- 기획자가 또 새 도구에 적응해야 함

구글 시트 하나로 해결되는데 굳이 레이어를 늘리지 않는다.

### 🚫 Webhook 직접 호출

Apps Script 에서 50번 서버를 직접 호출하는 건 이론적으로 가능하지만 안 했다. **빌드 검증 단계가 사라지기 때문**. GitHub Actions 를 중간에 끼우면 "코드가 깨진 채로 배포되는 것" 을 구조적으로 막을 수 있다.

## 1부 요약

- 구글 시트 편집 → 3~5분 후 운영 반영되는 파이프라인을 7단계로 구성
- **빌드 게이트** 가 핵심 안전장치: 실패 시 `publish` 브랜치는 갱신되지 않아 운영에 전파되지 않음
- GitHub Actions artifact 를 매개로 **"한 번 빌드, 어디든 배포"** 원칙을 지킴. 50번 서버에 Node 불필요
- n8n 은 webhook 수신과 SSH 실행기 역할만. 로직이 단순해서 별도 코드 서비스 불필요
- 배포는 **rsync 무중단**. Vite 해시 파일명 덕분에 파일 교체 중에도 충돌 없음
- 롤백은 자동화하지 않고 **원클릭 수동** 으로 유지. 판단은 사람의 몫

2부에서 다룰 것:

- Tomcat `allowLinking=false` 와 symlink 전략의 충돌, 그리고 rsync 로의 전환
- PAT 권한 분리 (Apps Script 용 Contents:Write vs n8n 용 Actions:Read)
- n8n active version 미동기화 이슈와 deactivate/activate 강제 토글
- `webapps/` 밖으로 `releases/` 를 이동하게 된 이유
- 인계 문서(SETUP.md, 운영 가이드) 작성과 장애 시나리오 정리

---

## Related

- [[2026-04-14 claude]]
