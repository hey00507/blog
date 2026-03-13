---
title: "Astro 5 + Tailwind CSS 4로 블로그 만들기"
description: "Astro와 Tailwind를 활용한 개인 블로그 구축 과정"
category: dev
tags: ["astro", "tailwind", "블로그", "github-pages"]
pubDate: 2026-03-13
series: "블로그 구축기"
---

개인 블로그를 Astro 5와 Tailwind CSS 4로 구축한 과정을 정리한다.

## 기술 스택 선택

```bash
pnpm create astro@latest blog -- --template minimal --typescript strict
pnpm astro add tailwind
```

## GitHub Pages 배포

GitHub Actions를 통해 `main` 브랜치에 push하면 자동으로 빌드 & 배포된다.

```yaml
on:
  push:
    branches: [main]
```

빌드 시간은 약 20초, 배포까지 합치면 30초 이내. 충분히 빠르다.

## 다크모드

시스템 설정을 감지하되, 사용자가 직접 토글할 수 있게 했다. `localStorage`에 선택을 저장해서 새로고침해도 유지된다.

다음 글에서는 Content Collections를 활용한 카테고리/태그 시스템을 다뤄보겠다.
