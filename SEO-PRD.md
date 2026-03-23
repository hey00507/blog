# Blog SEO 개선 PRD

> 작성일: 2026-03-23
> 대상: hey00507.github.io (Astro 6 + @astrojs/sitemap 3.7.1)
> 현황: 사이트 정상 운영 중, Google/Naver 인덱싱 미완료

---

## 현재 상태 요약

| 항목 | 상태 | 비고 |
|------|------|------|
| robots.txt | ✅ | `Allow: /`, sitemap 경로 포함 |
| sitemap | ⚠️ | URL만 나열, lastmod/priority 없음 |
| OG 태그 | ✅ | 전 페이지 적용 (title, desc, image) |
| Twitter Card | ✅ | summary_large_image |
| Canonical URL | ✅ | 동적 생성 |
| JSON-LD | ⚠️ | BlogPosting만 (포스트 상세 페이지) |
| 메타 description | ⚠️ | 태그/아카이브/페이지네이션 페이지 누락 |
| Cache-Control | ⚠️ | 전체 no-cache (정적 사이트에 비효율) |
| RSS | ✅ | 정상 |
| OG Image | ✅ | Satori 동적 생성 (카테고리별 그라데이션) |

---

## M1. Sitemap 인덱싱 강화

**목표:** 검색엔진이 콘텐츠 변경 시점과 중요도를 파악할 수 있도록 sitemap 품질 향상

### 작업 항목

| # | 작업 | 수정 파일 | 상세 |
|---|------|-----------|------|
| 1-1 | ~~lastmod 추가~~ | `astro.config.mjs` | ✅ 완료 — `serialize` 콜백에서 포스트 URL → `updatedDate ?? pubDate` 매핑 |
| 1-2 | ~~changefreq 설정~~ | `astro.config.mjs` | ✅ 완료 — 포스트: `monthly`, 카테고리/태그: `weekly`, 홈: `daily` |
| 1-3 | ~~priority 설정~~ | `astro.config.mjs` | ✅ 완료 — 포스트: `0.8`, 카테고리: `0.6`, 태그: `0.4`, 기타: `0.3` |

### 구현 방식

`@astrojs/sitemap`의 `serialize` 옵션 활용. 빌드 시점에 콘텐츠 파일의 frontmatter를 직접 파싱하여 URL-날짜 매핑 테이블 생성.

```
astro.config.mjs
└─ sitemap({ serialize(item) { ... } })
     ├─ /posts/* → lastmod = updatedDate ?? pubDate, priority 0.8
     ├─ /dev/, /reading/, /essay/ → priority 0.6, changefreq weekly
     ├─ /tags/* → priority 0.4, changefreq weekly
     └─ 기타 → priority 0.3, changefreq monthly
```

**주의:** `serialize`는 Astro 빌드 파이프라인 내부에서 실행되므로 `getCollection()` 사용 불가. `fs` + `gray-matter`로 frontmatter 직접 읽거나, 빌드 전 스크립트로 매핑 JSON 생성 필요.

### 예상 소요: ~30분

---

## M2. 구조화 데이터 보강

**목표:** 검색엔진이 사이트 구조와 페이지 유형을 정확히 이해하도록 Schema.org 마크업 추가

### 작업 항목

| # | 작업 | 수정 파일 | 상세 |
|---|------|-----------|------|
| 2-1 | ~~WebSite schema~~ | `BaseLayout.astro` | ✅ 완료 — 사이트 전체에 WebSite schema 적용 |
| 2-2 | ~~CollectionPage schema~~ | 카테고리/태그/아카이브 (7개) | ✅ 완료 — CollectionPage + ItemList numberOfItems |
| 2-3 | ~~BreadcrumbList schema~~ | `posts/[...slug].astro` | ✅ 완료 — 홈 > 카테고리 > 포스트 경로 |

### 수정 대상 파일

- `src/layouts/BaseLayout.astro` — WebSite schema 삽입
- `src/pages/reading/index.astro` — CollectionPage
- `src/pages/dev/index.astro` — CollectionPage
- `src/pages/essay/index.astro` — CollectionPage
- `src/pages/tags/index.astro` — CollectionPage
- `src/pages/tags/[tag].astro` — CollectionPage
- `src/pages/archive.astro` — CollectionPage
- (선택) Breadcrumb 컴포넌트 신규 생성

### 예상 소요: ~45분

---

## M3. 메타 태그 보완

**목표:** 모든 페이지에서 검색 결과 미리보기(snippet)가 의미 있게 표시되도록 메타 데이터 완성

### 작업 항목

| # | 작업 | 수정 파일 | 상세 |
|---|------|-----------|------|
| 3-1 | ~~태그 페이지 description~~ | `tags/index.astro`, `tags/[tag].astro` | ✅ 완료 — 태그별 글 수 포함한 동적 description |
| 3-2 | ~~아카이브 description~~ | `archive.astro` | ✅ 완료 — "전체 N개 글 아카이브" |
| 3-3 | ~~페이지네이션 description~~ | `[...page].astro` | ✅ 완료 — "N페이지 - 최신 글 목록" |
| 3-4 | ~~rel prev/next~~ | `[...page].astro` | ✅ 완료 — 페이지네이션 링크 관계 명시 |

### 현재 문제

| 페이지 | title | description |
|--------|-------|-------------|
| `/tags/` | `태그 - Ethan's Blog` | ❌ 기본값 사용 |
| `/tags/[tag]/` | `#tag - Ethan's Blog` | ❌ 기본값 사용 |
| `/archive/` | `아카이브 - Ethan's Blog` | ❌ 기본값 사용 |
| `/2/` (페이지네이션) | `Ethan's Blog - 2페이지` | ❌ 기본값 사용 |

### 예상 소요: ~20분

---

## M4. 성능 & 캐시 최적화

**목표:** 정적 사이트에 적합한 캐시 정책으로 로딩 속도 개선 및 검색엔진 크롤링 효율 향상

### 작업 항목

| # | 작업 | 수정 파일 | 상세 |
|---|------|-----------|------|
| 4-1 | ~~Cache-Control 개선~~ | `BaseLayout.astro` | ✅ 완료 — no-cache 메타 태그 3줄 제거 |
| 4-2 | ~~이미지 alt 텍스트~~ | 개별 포스트 + 컴포넌트 | ✅ 확인 완료 — 전 포스트 alt 정상 적용 |

### Cache-Control 상세

현재 BaseLayout에 아래 3줄이 있음:
```html
<meta http-equiv="Cache-Control" content="no-cache, no-store, must-revalidate" />
<meta http-equiv="Pragma" content="no-cache" />
<meta http-equiv="Expires" content="0" />
```

GitHub Pages는 자체 CDN(Fastly)으로 `Cache-Control: max-age=600`을 설정함. meta 태그의 HTTP 캐시 제어는 현대 브라우저에서 대부분 무시되지만, 일부 크롤러에 혼란을 줄 수 있음. **제거가 안전.**

### 예상 소요: ~15분

---

## 마일스톤 간 연계 분석

### 의존성 그래프

```
M1 (Sitemap) ─── 독립 ───── 단독 진행 가능
      │
      │  M1 완료 후 Search Console 재제출 → 인덱싱 효과 극대화
      ▼
M2 (Schema) ─── 독립 ───── 단독 진행 가능
      │
      │  M2의 WebSite schema가 BaseLayout에 들어가므로
      │  M3의 메타 태그 작업과 같은 파일 수정
      ▼
M3 (메타 태그) ── BaseLayout.astro 공유 ── M2와 동시 진행 권장
      │
      │  M4도 BaseLayout.astro의 cache meta 제거
      ▼
M4 (캐시) ───── BaseLayout.astro 공유 ── M2/M3과 동시 진행 권장
```

### 묶어서 처리할 수 있는 조합

| 번들 | 마일스톤 | 이유 | 합산 소요 |
|-------|----------|------|-----------|
| **A** | M2 + M3 + M4 | 모두 BaseLayout.astro 수정, 한 번에 처리하면 충돌 없음 | ~60분 (개별 합산 80분 → 중복 제거) |
| **B** | M1 | astro.config.mjs만 수정, 독립적 | ~30분 |

### 권장 진행 순서

```
1️⃣  M1 (Sitemap)     — 30분 — 인덱싱 효과가 가장 즉각적
2️⃣  M2+M3+M4 묶음    — 60분 — BaseLayout 한 번에 정리
3️⃣  빌드 & 배포
4️⃣  Search Console에서 sitemap 재제출 + URL 검사
```

**총 예상 소요: ~90분**

### 인덱싱 효과 우선순위

| 순위 | 마일스톤 | 인덱싱 기여도 | 이유 |
|------|----------|--------------|------|
| 1 | M1 | ⭐⭐⭐⭐⭐ | lastmod가 없으면 크롤러가 변경 감지 불가 |
| 2 | M4 | ⭐⭐⭐ | no-cache 메타가 크롤러 혼란 유발 가능 |
| 3 | M3 | ⭐⭐ | description 누락 → 검색 결과 snippet 품질 저하 |
| 4 | M2 | ⭐⭐ | 구조화 데이터는 리치 결과(Rich Result)에 영향, 인덱싱 자체와는 간접적 |
