# Blog Writing Rules

## 카테고리 & 소카테고리

| category | subcategory | slug | 용도 |
|----------|-------------|------|------|
| essay | workout | `/essay/workout/` | 러닝, 운동 기록 |
| essay | retrospective | `/essay/retrospective/` | 주간/월간 회고 |
| essay | diary | `/essay/diary/` | 일기, 일상 에세이 |
| dev | work | `/dev/work/` | 업무 프로젝트 회고 |
| dev | til | `/dev/til/` | Today I Learned |
| dev | project | `/dev/project/` | 사이드 프로젝트 개발기 |
| reading | review | `/reading/review/` | 서평 |
| reading | note | `/reading/note/` | 독서 노트 |

## 글 제목 규칙

| 유형 | 제목 형식 | 예시 |
|------|----------|------|
| 주간 회고 | `{연도}년 {N}주차 회고` | 2026년 12주차 회고 |
| 러닝/운동 | `{월} {N}째주 러닝 로그` | 3월 3째주 러닝 로그 |
| 일기 | 자유 (날짜 불필요) | 레이스 다음 날, 귀요미 버블헤드 |
| 개발 | 자유 | HabitFlow — SwiftUI + Firebase로 습관 트래커 만들기 |

## Frontmatter 필수 사항

```yaml
---
title: "제목"
description: "1~2줄 설명"
category: "essay"          # essay, dev, reading 중 택 1
subcategory: "workout"     # 소카테고리 (위 표 참조)
tags: ["태그1", "태그2"]
pubDate: 2026-03-21T21:30:00  # 반드시 현재 시각 기준 (미래 시간 X)
draft: false
---
```

- `pubDate`는 항상 **현재 시각 이전**으로 설정 (미래 시간이면 글이 안 보임)
- `subcategory`는 반드시 위 표의 slug 값 사용

## 이미지 규칙

- 경로: `public/images/{카테고리별}/`
  - 개발 스크린샷: `public/images/dev/`
  - 일기/에세이 이미지: `public/images/diary/`
  - 포스트별 묶음: `public/images/posts/{slug}/`
  - 독서 이미지: `public/images/reading/`
- 압축: `sips -s formatOptions 60 -Z 800` (JPEG 60%, 최대 800px)
- HEIC/PNG → JPEG 변환: `sips -s format jpeg`
- 크기 제한: 원본 대신 적절한 `max-width` 지정 (보통 200~350px)
- alt 텍스트: 반드시 의미 있는 설명 포함

## 영상 규칙

- 형식: MP4 (MOV는 ffmpeg으로 변환)
- 오디오 불필요 시: `ffmpeg -i input.mp4 -an -c:v copy output.mp4`
- MOV→MP4 변환: `ffmpeg -i input.MOV -c:v libx264 -crf 28 -preset medium -c:a aac -movflags +faststart -vf "scale='min(720,iw)':-2" output.mp4`
- 영상 썸네일: ffmpeg으로 첫 프레임 캡처하여 `heroImage` 또는 본문 `<img>` 삽입
  - `ffmpeg -i video.mp4 -vframes 1 -q:v 2 thumbnail.jpeg`
- 영상 태그: `<video>` 사용, `autoplay loop muted playsinline` 속성 필수

## PostCard 썸네일

- 블로그 PostCard에 썸네일이 표시됨 (본문 첫 `<img>` 또는 `heroImage`)
- 다른 레포/외부 URL 이미지를 참조하면 빌드 시 깨질 수 있음 → 반드시 `public/images/` 내부 경로 사용

### 영상 글의 썸네일 처리

- **본문에 영상만 있는 경우** (이미지 없음):
  - 영상에서 중요해 보이는 장면을 캡처하여 썸네일 생성: `ffmpeg -i video.mp4 -vframes 1 -q:v 2 thumbnail.jpeg`
  - `heroImage`에 캡처 이미지 경로 지정
  - frontmatter에 `heroImageOnly: true` 추가 → PostCard 썸네일로만 사용, 본문에서는 자동 숨김
  - PostCard에서는 `heroImage`로 썸네일 표시, 본문에서는 영상만 보임

- **본문에 이미지 + 영상이 함께 있는 경우**:
  - 별도 지정이 없으면 **첫 번째 이미지**를 `heroImage`(썸네일)로 지정
  - 본문에 이미지가 자연스럽게 보이므로 `display:none` 불필요

## 글 분리 원칙

- 회고는 개괄적으로, 세부 내용은 별도 글로 분리
- 러닝 기록 → `essay/workout` 별도 글 + 회고에서 링크
- 일기/에세이 → `essay/diary` 별도 글 + 회고에서 링크
- 회고에서는 각 글로 `>` blockquote 링크 연결
