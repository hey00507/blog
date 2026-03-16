---
title: "Astro 블로그에 소카테고리 시스템 추가하기"
description: "Content Collections 스키마 확장과 동적 라우팅으로 소카테고리를 구현한 과정"
category: dev
subcategory: til
tags: ["astro", "블로그", "라우팅", "content-collections"]
pubDate: 2026-03-16T09:00:00
series: "블로그 구축기"
---

블로그 글이 늘어나면서 카테고리만으로는 부족해졌다. 독서에는 서평과 독서노트가 섞이고, 일상에는 운동 기록과 회고가 뒤섞인다. 소카테고리를 도입해서 해결한 과정을 정리한다.

## 설계: 기존 글 깨뜨리지 않기

핵심 제약은 **기존 글을 수정하지 않아도 동작해야 한다**는 것. `subcategory`를 optional로 두면 된다.

```typescript
// content.config.ts
const posts = defineCollection({
  schema: z.object({
    category: z.enum(['reading', 'essay', 'dev']),
    subcategory: z.string().optional(), // 새 필드, 기존 글은 undefined
    // ...
  }),
});
```

소카테고리 정의는 별도 유틸로 분리했다.

```typescript
// utils/subcategories.ts
export const subcategories: Record<Category, Subcategory[]> = {
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

## 동적 라우팅: getStaticPaths 주의점

`/reading/review`, `/essay/workout` 같은 URL을 만들려면 카테고리별로 `[subcategory].astro`가 필요하다.

```
src/pages/
├── reading/
│   ├── index.astro          # /reading (전체)
│   └── [subcategory].astro  # /reading/review, /reading/note
├── essay/
│   ├── index.astro
│   └── [subcategory].astro
└── dev/
    ├── index.astro
    └── [subcategory].astro
```

여기서 한 가지 함정에 빠졌다. `getStaticPaths()`에서 외부 변수를 참조하면 Astro 빌드 시 스코핑 이슈가 생긴다.

```typescript
// 이렇게 하면 빌드에서 문제 발생
const category = 'reading';

export async function getStaticPaths() {
  const allPosts = await getCollection('posts');
  const filtered = allPosts.filter(p => p.data.category === category);
  // ...
}
```

`getStaticPaths`는 빌드 타임에 독립적으로 실행되기 때문에, 카테고리 값을 **리터럴로 직접 넣어야** 한다.

```typescript
// 각 카테고리 폴더의 [subcategory].astro에서 리터럴 사용
export async function getStaticPaths() {
  const allPosts = await getCollection('posts');
  const filtered = allPosts.filter(p => p.data.category === 'reading');
  // ...
}
```

파일이 3개로 늘어나지만, 명확하고 안전하다.

## 네비게이션: Header 드롭다운

데스크톱에서는 hover 시 드롭다운, 모바일에서는 아코디언으로 소카테고리를 보여준다.

```html
<!-- Header.astro (간략화) -->
<li class="nav-item">
  <a href="/reading">독서</a>
  <ul class="dropdown">
    <li><a href="/reading/review">서평</a></li>
    <li><a href="/reading/note">독서노트</a></li>
  </ul>
</li>
```

모바일 아코디언은 `aria-expanded`와 `aria-controls`로 접근성을 챙겼고, `Escape` 키로 닫히게 했다.

## SubcategoryNav 컴포넌트

카테고리 메인 페이지와 소카테고리 페이지 상단에 탭 UI를 넣어 전환을 쉽게 했다.

```astro
---
// SubcategoryNav.astro
const { category, current } = Astro.props;
const subs = subcategories[category];
---
<nav class="subcategory-nav">
  <a href={`/${category}`} class:list={[{ active: !current }]}>전체</a>
  {subs.map(sub => (
    <a href={`/${category}/${sub.slug}`} class:list={[{ active: current === sub.slug }]}>
      {sub.label}
    </a>
  ))}
</nav>
```

## PostCard와 OG 이미지에도 반영

PostCard에 소카테고리 뱃지를 추가하고, OG 이미지 생성(Satori)에도 소카테고리 라벨을 넣었다. 카카오톡이나 Slack에서 링크를 공유하면 "독서 > 서평" 같은 라벨이 보인다.

## 결과

- 빌드: 28 → 35 pages (소카테고리 페이지 7개 추가)
- 기존 글 수정: 0개 (optional 필드로 하위호환)
- 새 글 작성 시: `subcategory: til` 한 줄만 추가하면 자동 분류

작은 기능이지만, 글이 쌓일수록 효과가 커질 구조다. 다음에는 검색 기능을 추가해볼 예정이다.
