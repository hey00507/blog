# PRD: Ethan's Personal Blog

## 1. 프로젝트 개요

개인 블로그. 독서 감상, 일상 에세이, 코딩/기술 콘텐츠를 정리하는 공간.

- **기술 스택**: Astro + TypeScript + Tailwind CSS
- **호스팅**: GitHub Pages (무료)
- **도메인**: 초기 `username.github.io` → 추후 커스텀 도메인 연결
- **배포**: GitHub Actions 자동 빌드/배포

---

## 2. 콘텐츠 구조

### 카테고리 (3개)

| 카테고리 | 슬러그 | 설명 |
|---------|--------|------|
| **독서** | `reading` | 책 리뷰, 독후감, 인상 깊은 구절 정리 |
| **일상** | `essay` | 일상 기록, 생각 정리, 에세이 |
| **코딩** | `dev` | 기술 학습, 개발 경험, 트러블슈팅 |

### 소카테고리 (M12)

| 대분류 | 소분류 | slug |
|--------|--------|------|
| 독서 (`reading`) | 서평 | `review` |
| | 독서노트 | `note` |
| 일상 (`essay`) | 운동 | `workout` |
| | 회고 | `retrospective` |
| | 일기 | `diary` |
| 코딩 (`dev`) | 업무 | `work` |
| | TIL | `til` |

### 글 메타데이터 (Frontmatter)

```yaml
---
title: "글 제목"
description: "한 줄 요약"
category: "reading" | "essay" | "dev"
subcategory: "review"            # 선택 (M12)
tags: ["astro", "typescript"]  # 자유 태그
pubDate: 2026-03-12
updatedDate: 2026-03-13        # 선택
draft: false
# 독서 카테고리 전용
bookTitle: "책 제목"
bookAuthor: "저자"
rating: 4                      # 1-5점, 선택
# 코딩 카테고리 전용
series: "Astro 입문기"          # 시리즈 묶음, 선택
---
```

---

## 3. 페이지 구성

### 메인 페이지 (`/`)
- 최신 글 목록 (전체 카테고리 혼합, 최신순)
- 카테고리별 필터 탭 (전체 / 독서 / 일상 / 코딩)
- 각 글 카드: 제목, 설명, 날짜, 카테고리 뱃지, 읽기 시간

### 카테고리 페이지 (`/reading`, `/essay`, `/dev`)
- 해당 카테고리 글 목록
- `/reading`: 책 제목·저자·별점 표시
- `/dev`: 시리즈 묶음 표시

### 글 상세 페이지 (`/posts/[slug]`)
- 본문 (Markdown/MDX)
- 메타 정보: 날짜, 카테고리, 태그, 읽기 시간
- 목차 (Table of Contents) — 코딩 글처럼 긴 글에서 유용
- 이전/다음 글 네비게이션
- 댓글 (Giscus — GitHub Discussions 기반, 무료)

### 태그 페이지 (`/tags`, `/tags/[tag]`)
- 전체 태그 목록 + 태그별 글 목록

### About 페이지 (`/about`)
- 자기소개, 블로그 소개, 소셜 링크

### 아카이브 페이지 (`/archive`)
- 연도별 전체 글 목록 (타임라인 형태)

---

## 4. 핵심 기능

### MVP (v1.0)

| 기능 | 설명 | 구현 방식 |
|------|------|----------|
| **다크/라이트 모드** | 시스템 감지 + 수동 토글 | CSS 변수 + localStorage |
| **검색** | 정적 전문 검색 | Pagefind (빌드 시 인덱싱, 서버 불필요) |
| **RSS 피드** | `/rss.xml` | `@astrojs/rss` |
| **읽기 시간** | 글 카드 및 상세에 표시 | 글자수 기반 자동 계산 |
| **목차 (TOC)** | 글 상세 사이드바 | 자동 heading 추출 |
| **SEO** | OpenGraph, sitemap, canonical URL | `@astrojs/sitemap` + 메타 태그 |
| **반응형 디자인** | 모바일/태블릿/데스크톱 | Tailwind CSS |
| **코드 하이라이팅** | 코딩 글의 코드 블록 | Shiki (Astro 내장) |
| **댓글** | 글 하단 댓글 영역 | Giscus (GitHub Discussions) |
| **Draft 모드** | `draft: true`인 글은 빌드에서 제외 | Astro Content Collections |

### v2.0 — Phase 2 기능 확장

#### M7: OG 이미지 자동 생성

소셜 미디어 공유 시 글 제목/카테고리가 포함된 이미지를 빌드 타임에 자동 생성한다.

**구현 방식:**
- `satori` + `sharp`로 HTML 템플릿 → PNG 변환 (빌드 타임)
- Astro 엔드포인트(`/og/[slug].png`)로 동적 생성
- BaseLayout의 `og:image` 메타 태그에 자동 연결

**OG 이미지 디자인:**
```
┌─────────────────────────────────────┐
│                                     │
│  [카테고리 뱃지]                      │
│                                     │
│  글 제목 (큰 폰트)                    │
│  한 줄 설명                           │
│                                     │
│  ─────────────────────              │
│  Ethan's Blog · 2026-03-13         │
│                                     │
└─────────────────────────────────────┘
```

- 카테고리별 배경 그라데이션: 독서(보라), 일상(노랑), 코딩(파랑)
- 다크 배경 + 밝은 텍스트 (소셜 피드에서 눈에 띔)
- 크기: 1200x630px (OpenGraph 표준)

**체크리스트:**
- [x] `satori` + `@resvg/resvg-js` 설치 ✅
- [x] OG 이미지 엔드포인트 생성 (`src/pages/og/[...slug].png.ts`) ✅
- [x] 카테고리별 그라데이션 템플릿 (독서:보라, 일상:앰버, 코딩:파랑) ✅
- [x] BaseLayout `og:image` 메타 태그 동적 연결 + twitter:summary_large_image ✅
- [x] 독서 카테고리: 책 제목/저자 추가 표시 ✅
- [x] 빌드 테스트 및 소셜 미디어 프리뷰 검증 ✅
- [x] Noto Sans KR Bold 폰트 번들 (한글 렌더링) ✅

---

#### M8: 시리즈 네비게이션

코딩 카테고리에서 연작 글을 시리즈로 묶어 순서대로 탐색할 수 있게 한다.

**구현 방식:**
- 기존 frontmatter `series` 필드 활용 (이미 스키마에 존재)
- 같은 `series` 값을 가진 글들을 `pubDate` 순으로 묶음
- 글 상세 페이지 상단에 시리즈 네비게이션 박스 표시
- 시리즈 목록 페이지 (`/dev/series/[name]`)

**시리즈 네비게이션 UI:**
```
┌─ 📂 블로그 구축기 (2/3) ─────────────┐
│  1. Astro 블로그 만들기          ✅  │
│  2. Content Collections 설정     ◀  │
│  3. 검색과 SEO 최적화                │
└──────────────────────────────────────┘
```

**체크리스트:**
- [x] SeriesNav 컴포넌트 생성 ✅
- [x] 같은 시리즈 글 쿼리 및 순서 정렬 ✅
- [x] 글 상세 페이지에 시리즈 네비게이션 삽입 ✅
- [x] 시리즈 목록 페이지 (`/dev/series/[name]`) ✅
- [x] 코딩 카테고리 페이지에 시리즈별 그룹 표시 ✅
- [x] 날짜 기반 URL 체계 (`/posts/yyyymmdd/`) ✅
- [x] 날짜+시간 표시 형식 (`yyyy-mm-dd hh:mm:ss`) ✅

---

#### M9: 독서 대시보드

읽은 책의 통계를 시각화하는 `/reading/dashboard` 페이지를 만든다.

**구현 방식:**
- Content Collections에서 `category: reading` 글을 집계
- CSS + inline SVG로 순수 정적 차트 (JS 라이브러리 불필요)
- 빌드 타임에 데이터 계산 → 정적 HTML 출력

**대시보드 구성:**
```
📊 독서 대시보드

총 읽은 책: 12권 | 평균 별점: 3.8 | 올해: 5권

[별점 분포]          [월별 독서량]
★★★★★ ████ 4      1월 ██ 2
★★★★☆ ██████ 6    2월 ███ 3
★★★☆☆ ██ 2        3월 █ 1
★★☆☆☆ 0           ...
★☆☆☆☆ 0

[최근 읽은 책]
📖 소프트웨어 장인 — 산드로 만쿠소 ★★★★☆
📖 클린 코드 — 로버트 마틴 ★★★★★
...
```

**체크리스트:**
- [x] `/reading/dashboard` 페이지 생성 ✅
- [x] 총 독서량, 평균 별점, 연도별 통계 계산 ✅
- [x] 별점 분포 바 차트 (CSS) ✅
- [x] 월별 독서량 바 차트 (CSS) ✅
- [x] 최근 읽은 책 목록 ✅
- [x] 독서 카테고리 페이지에 대시보드 링크 추가 ✅
- [x] 책이 0권일 때 빈 상태 처리 ✅

---

#### M10: Obsidian → 블로그 자동 투고 파이프라인

Obsidian에서 `#publish` 태그를 붙인 노트를 감지하여 자동으로 블로그에 투고한다.

**구현 방식:**
- Claude Code 스킬 `/blog-sync`로 구현
- Obsidian vault를 스캔하여 `#publish` 태그가 있는 노트를 탐색
- 이미 투고된 글은 skip (블로그에 동일 제목/출처가 있는지 확인)
- 새 글 또는 업데이트된 글만 처리

**워크플로우:**
```
Obsidian 노트 (태그: #publish)
    ↓
/blog-sync 실행
    ↓
#publish 태그 노트 목록 표시
    ↓
사용자 확인 (전부 / 선택 / 스킵)
    ↓
Obsidian 문법 → 표준 Markdown 변환
    ↓
frontmatter 자동 생성 (카테고리/태그 AI 추론)
    ↓
블로그 repo에 저장 → 빌드 → 배포
    ↓
투고 완료 → Obsidian 노트에 #published 태그 추가
```

**자동 매핑 규칙:**
| Obsidian 태그 | 블로그 카테고리 | 비고 |
|--------------|---------------|------|
| `#publish/reading` | `reading` | 책 관련 필드 자동 추출 시도 |
| `#publish/essay` | `essay` | |
| `#publish/dev` | `dev` | 코드 블록 존재 시 자동 감지 |
| `#publish` (단독) | AI가 내용 분석하여 추론 | |

**체크리스트:**
- [x] `/blog-sync` 스킬 생성 ✅
- [x] Obsidian vault `#publish` 태그 스캔 로직 ✅
- [x] 이미 투고된 글 중복 방지 (출처 추적) ✅
- [x] Obsidian → Markdown 변환 (wikilink, callout, 이미지) ✅
- [x] 카테고리 자동 추론 로직 ✅
- [x] 투고 완료 후 `#published` 태그 자동 추가 ✅
- [x] `claude-productivity` 레포에 스킬 반영 ✅

---

#### M11: 주간 회고 자동 생성

매주 Claude 대화 로그를 기반으로 "이번 주 뭐했나" 회고 초안을 자동 생성한다.

**구현 방식:**
- Claude Code 스킬 `/blog-weekly`로 구현
- `040.Logs/` 폴더에서 해당 주의 로그를 읽어 요약
- Google Calendar에서 해당 주 일정도 함께 참조
- 회고 초안을 생성하고 사용자 확인 후 블로그에 투고

**워크플로우:**
```
/blog-weekly 실행
    ↓
이번 주 (월~일) 범위 결정
    ↓
040.Logs/ 에서 해당 주 로그 수집
    ↓
Google Calendar에서 주요 일정 조회
    ↓
회고 초안 생성 (카테고리: essay, 태그: 회고)
    ↓
사용자 확인/수정 후 투고
```

**회고 글 템플릿:**
```markdown
---
title: "2026년 11주차 회고"
description: "3/9 ~ 3/15 이번 주를 돌아보며"
category: essay
tags: ["회고", "주간회고"]
pubDate: 2026-03-15
---

## 이번 주 한 일
- 블로그 MVP 완성 (M1~M6)
- Claude Dashboard Phase 1 완료
- CloudPocket 테마 시스템 구현

## 배운 것
- Astro Content Collections v5 활용법
- GoatCounter 정적 사이트 분석
- ...

## 다음 주 계획
- (사용자 입력)

## 한 줄 회고
- (사용자 입력)
```

**체크리스트:**
- [x] `/blog-weekly` 스킬 생성 ✅
- [x] 주간 범위 계산 (월~일) ✅
- [x] `040.Logs/` 로그 수집 및 요약 ✅
- [x] Google Calendar 주간 일정 조회 연동 ✅
- [x] 회고 템플릿 기반 초안 생성 ✅
- [x] 사용자 확인 후 블로그 투고 (draft 옵션) ✅
- [x] `claude-productivity` 레포에 스킬 반영 ✅

---

#### M12: 소카테고리 시스템

대분류(독서/일상/코딩) 안에 소분류를 추가하여 글을 더 세밀하게 분류한다.

**소카테고리 구조:**

| 대분류 | slug | 소분류 | slug | 설명 |
|--------|------|--------|------|------|
| 독서 | `reading` | 서평 | `review` | 책 리뷰, 독후감 |
| | | 독서노트 | `note` | 인상 깊은 구절, 메모 |
| 일상 | `essay` | 운동 | `workout` | 러닝, 마라톤, 운동 기록 |
| | | 회고 | `retrospective` | 주간/월간 회고 |
| | | 일기 | `diary` | 일상 기록, 사색 |
| 코딩 | `dev` | 업무 | `work` | 회사/프로젝트 개발 경험 |
| | | TIL | `til` | Today I Learned, 학습 기록 |

**스키마 변경:**
```yaml
# content.config.ts
category: z.enum(['reading', 'essay', 'dev'])       # 기존 유지
subcategory: z.string().optional()                    # 신규 추가 (optional)
```

- 기존 글은 subcategory 없이 그대로 동작 (하위 호환)
- 새 글만 선택적으로 subcategory 지정

**라우팅:**
```
/reading/             → 독서 전체 (subcategory 유무 관계없이)
/reading/review/      → 서평만 필터링
/reading/note/        → 독서노트만 필터링
/essay/               → 일상 전체
/essay/workout/       → 운동만
/essay/retrospective/ → 회고만
/essay/diary/         → 일기만
/dev/                 → 코딩 전체
/dev/work/            → 업무만
/dev/til/             → TIL만
```

- 동적 라우팅 (`/[category]/[subcategory]/index.astro`) + `getStaticPaths()`
- 기존 카테고리 페이지는 전체 목록 유지

**네비게이션 (헤더 드롭다운):**
```
Desktop:
[독서 ▾] [일상 ▾] [코딩 ▾] [About]
          ┌──────────┐
          │ 전체      │
          │ 운동      │
          │ 회고      │
          │ 일기      │
          └──────────┘

Mobile (햄버거 메뉴):
│ 독서              │
│   ├ 서평           │
│   └ 독서노트       │
│ 일상              │
│   ├ 운동           │
│   ├ 회고           │
│   └ 일기           │
│ 코딩              │
│   ├ 업무           │
│   └ TIL           │
```

- 드롭다운 hover(desktop) / accordion(mobile)
- 각 항목 클릭 → 소카테고리 페이지로 이동

**소카테고리 설정 파일:**
```typescript
// src/utils/subcategories.ts
export const subcategories = {
  reading: [
    { slug: 'review', label: '서평' },
    { slug: 'note', label: '독서노트' },
  ],
  essay: [
    { slug: 'workout', label: '운동' },
    { slug: 'retrospective', label: '회고' },
    { slug: 'diary', label: '일기' },
  ],
  dev: [
    { slug: 'work', label: '업무' },
    { slug: 'til', label: 'TIL' },
  ],
};
```

**수정 대상 파일:**
1. `src/content.config.ts` — subcategory 필드 추가
2. `src/utils/subcategories.ts` — 신규 생성 (소카테고리 정의)
3. `src/utils/categories.ts` — subcategory 관련 헬퍼 추가
4. `src/components/Header.astro` — 드롭다운 메뉴 구현
5. `src/pages/[category]/[subcategory]/index.astro` — 동적 소카테고리 페이지
6. `src/components/PostCard.astro` — 소카테고리 뱃지 표시
7. `src/pages/archive.astro` — 소카테고리 표시 추가
8. 기존 카테고리 페이지 (`reading/`, `essay.astro`, `dev.astro`) — "전체" 동작 확인
9. OG 이미지 생성 — 소카테고리 표시 반영

**체크리스트:**
- [x] content.config.ts에 subcategory 필드 추가 ✅
- [x] subcategories.ts 설정 파일 생성 ✅
- [x] 동적 라우팅 페이지 구현 ✅
- [x] Header 드롭다운 메뉴 (desktop + mobile) ✅
- [x] PostCard에 소카테고리 뱃지 표시 ✅
- [x] 아카이브 페이지 소카테고리 반영 ✅
- [x] OG 이미지에 소카테고리 표시 ✅
- [x] 기존 글 하위 호환 확인 ✅
- [x] SubcategoryNav 컴포넌트 (카테고리 페이지 내 탭 네비) ✅
- [x] 빌드 + 배포 테스트 ✅

---

### v3.0 — 품질 개선 & 확장 (글 투고하며 점진적 개선)

> 방향: 주 1~2회 글을 투고하면서 불편사항을 발견할 때마다 개선한다.

#### Quick Wins (바로 적용 가능)

| # | 기능 | 설명 | 효과 |
|---|------|------|------|
| 1 | JSON-LD 스키마 | BlogPosting 구조화 데이터 추가 | Google 리치 스니펫 |
| 2 | 포커스 링 | 키보드 내비게이션 시 포커스 표시 (WCAG AA) | 접근성 |
| 3 | About 페이지 보강 | 프로필 이미지, 소셜 링크, 상세 바이오 | 신뢰도 |
| 4 | 공유 버튼 | 트위터, 링크 복사 버튼 | 글 확산 |
| 5 | 모바일 메뉴 접근성 | aria-expanded, 포커스 트랩 | 접근성 |

**체크리스트:**
- [x] JSON-LD BlogPosting 구조화 데이터 (글 상세 페이지 + head slot) ✅
- [x] 포커스 링 스타일 (global.css에 :focus-visible 규칙) ✅
- [x] About 페이지 리뉴얼 (프로필 이미지, 소셜 링크, 바이오) ✅
- [x] 공유 버튼 컴포넌트 (글 상세 페이지 하단) ✅
- [x] 모바일 메뉴 aria-expanded + Escape 닫기 ✅

#### 기능 추가

| # | 기능 | 설명 |
|---|------|------|
| 6 | 관련 글 추천 | 태그 유사도 기반 "관련 글" 섹션 |
| 7 | Hero 이미지 | 글 스키마에 heroImage 필드 + 카드/상세 표시 |
| 8 | robots.txt | 명시적 크롤링 규칙 |
| 9 | 코드 블록 복사 버튼 | 개발 글 UX 개선 |
| 10 | 글 목록 페이지네이션 | 글이 많아지면 적용 |

**체크리스트:**
- [x] RelatedPosts 컴포넌트 (태그 유사도 기반 추천) ✅
- [x] heroImage 필드 추가 (content.config.ts + PostCard + 상세 페이지) ✅
- [x] robots.txt 추가 (public/) ✅
- [x] 코드 블록 복사 버튼 (글 상세 페이지에 JS 삽입) ✅
- [x] 페이지네이션 (Astro paginate, 10개/페이지) ✅

#### Long-Term

| # | 기능 | 설명 |
|---|------|------|
| 11 | 커스텀 도메인 | GitHub Pages CNAME 설정 |
| 12 | 뉴스레터 구독 | Buttondown 또는 ConvertKit 연동 |
| 13 | i18n (다국어) | 한/영 지원 |
| 14 | 다크모드 코드 테마 분리 | 라이트: github-light / 다크: tokyo-night |
| 15 | 글 스케줄링 | 특정 날짜에 자동 공개 |

**체크리스트:**
- [ ] 커스텀 도메인 설정 (CNAME + DNS)
- [ ] 뉴스레터 구독 폼 (Buttondown 또는 ConvertKit)
- [ ] i18n 다국어 지원 (한/영 라우팅)
- [ ] 다크모드 코드 테마 분리 (shiki dual theme)
- [ ] 글 스케줄링 (pubDate 미래 날짜 → 빌드 시 제외)

---

## 5. 디자인 방향

### 톤앤매너
- **미니멀 + 가독성 중심**: 글을 읽는 데 집중할 수 있는 깔끔한 디자인
- 불필요한 장식 없이 타이포그래피와 여백으로 완성
- 독서/일상 글은 편안한 느낌, 코딩 글은 명확한 구조

### 타이포그래피
- 본문: Pretendard (한글) + Inter (영문) — 웹폰트 무료
- 코드: JetBrains Mono 또는 Fira Code

### 컬러
- 라이트: 깨끗한 화이트 배경 + 다크 텍스트
- 다크: 부드러운 다크 배경 (#1a1a2e 계열) + 밝은 텍스트
- 카테고리별 액센트 컬러로 시각적 구분

---

## 6. 기술 스택 상세

| 항목 | 선택 | 버전 |
|------|------|------|
| 프레임워크 | Astro | 5.x (최신 LTS) |
| 언어 | TypeScript | 5.x |
| 스타일링 | Tailwind CSS | 4.x |
| 런타임 | Node.js | 22.x LTS |
| 패키지 매니저 | pnpm | 9.x |
| 콘텐츠 | Astro Content Collections | v5 (type-safe) |
| 검색 | Pagefind | 1.x |
| 댓글 | Giscus | - |
| 배포 | GitHub Actions → GitHub Pages | - |
| 코드 하이라이팅 | Shiki | Astro 내장 |

---

## 7. 프로젝트 구조 (예상)

```
blog/
├── public/
│   └── favicon.svg
├── src/
│   ├── components/       # 재사용 컴포넌트
│   │   ├── Header.astro
│   │   ├── Footer.astro
│   │   ├── PostCard.astro
│   │   ├── TOC.astro
│   │   ├── Search.astro
│   │   └── ThemeToggle.astro
│   ├── content/          # 콘텐츠 (글)
│   │   └── posts/
│   │       ├── reading/
│   │       ├── essay/
│   │       └── dev/
│   ├── layouts/
│   │   ├── BaseLayout.astro
│   │   └── PostLayout.astro
│   ├── pages/
│   │   ├── index.astro
│   │   ├── about.astro
│   │   ├── archive.astro
│   │   ├── rss.xml.ts
│   │   ├── reading/
│   │   ├── essay/
│   │   ├── dev/
│   │   ├── posts/[slug].astro
│   │   └── tags/
│   ├── styles/
│   │   └── global.css
│   └── utils/
│       └── readingTime.ts
├── astro.config.mjs
├── tailwind.config.mjs
├── tsconfig.json
├── package.json
└── prd.md
```

---

## 8. 참고 블로그

실제 운영 중인 Astro 블로그에서 참고할 점:

| 블로그 | 참고 포인트 |
|--------|-----------|
| [sadman.ca](https://sadman.ca) | 독서 리뷰 + 에세이 + 기술 혼합 구조, 깔끔한 다크모드 |
| [cassidoo.co](https://cassidoo.co) | 태그 기반 필터링, 랜덤 글 버튼, 개성 있는 톤 |
| [astro-paper 테마](https://github.com/satnaing/astro-paper) | 검색, 태그, TOC, OG 이미지 등 기능 완성도 높음 |
| [Fuwari 테마](https://github.com/saicaca/fuwari) | 비주얼 완성도, 애니메이션, 배너 커스터마이징 |

---

## 9. 마일스톤

| 단계 | 내용 | 상태 |
|------|------|------|
| **M1** | Astro 프로젝트 초기화 + 기본 레이아웃 + 다크모드 | ✅ |
| **M2** | Content Collections 설정 + 카테고리/태그 시스템 | ✅ |
| **M3** | 글 상세 페이지 + TOC + 읽기 시간 + 코드 하이라이팅 | ✅ |
| **M4** | 검색 (Pagefind) + RSS + SEO + Sitemap + 아카이브 | ✅ |
| **M5** | GitHub Pages 배포 + GitHub Actions CI/CD | ✅ |
| **M6** | Giscus 댓글 + 모바일 반응형 + GoatCounter 분석 | ✅ |
| **M7** | OG 이미지 자동 생성 (Satori) | ✅ |
| **M8** | 시리즈 네비게이션 | ✅ |
| **M9** | 독서 대시보드 | ✅ |
| **M10** | Obsidian → 블로그 자동 투고 파이프라인 (`/blog-sync`) | ✅ |
| **M11** | 주간 회고 자동 생성 (`/blog-weekly`) | ✅ |
| **M12** | 소카테고리 시스템 (드롭다운 네비 + 동적 라우팅) | ✅ |
