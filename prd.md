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

### 글 메타데이터 (Frontmatter)

```yaml
---
title: "글 제목"
description: "한 줄 요약"
category: "reading" | "essay" | "dev"
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

### 추후 확장 (v2.0+)

| 기능 | 설명 |
|------|------|
| 커스텀 도메인 | GitHub Pages CNAME 설정 |
| OG 이미지 자동 생성 | Satori 기반, 글 제목으로 소셜 공유 이미지 자동 생성 |
| 뉴스레터 구독 | Buttondown 또는 ConvertKit 연동 |
| 독서 대시보드 | 연간 독서 통계, 별점 분포 시각화 |
| 시리즈 네비게이션 | 코딩 시리즈 글 간 순서 네비게이션 |
| i18n (다국어) | 한/영 지원 |

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

| 단계 | 내용 |
|------|------|
| **M1** | Astro 프로젝트 초기화 + 기본 레이아웃 + 다크모드 |
| **M2** | Content Collections 설정 + 카테고리/태그 시스템 |
| **M3** | 글 상세 페이지 + TOC + 읽기 시간 + 코드 하이라이팅 |
| **M4** | 검색 (Pagefind) + RSS + SEO + 댓글 (Giscus) |
| **M5** | GitHub Pages 배포 + GitHub Actions CI/CD |
| **M6** | 디자인 다듬기 + 샘플 글 작성 + 런칭 |
