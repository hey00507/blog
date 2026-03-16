import type { APIContext } from 'astro';
import { getCollection } from 'astro:content';
import { getPublishedPosts } from '../../utils/posts';
import { buildSlugMap } from '../../utils/slugs';
import { formatDate } from '../../utils/formatDate';
import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';
import fs from 'node:fs';
import path from 'node:path';

const CATEGORY_GRADIENTS: Record<string, [string, string]> = {
  reading: ['#7c3aed', '#a855f7'], // 보라
  essay: ['#d97706', '#f59e0b'],   // 노랑/앰버
  dev: ['#2563eb', '#3b82f6'],     // 파랑
};

const CATEGORY_LABELS: Record<string, string> = {
  reading: '독서',
  essay: '일상',
  dev: '코딩',
};

const SUBCATEGORY_LABELS: Record<string, Record<string, string>> = {
  reading: { review: '서평', note: '독서노트' },
  essay: { workout: '운동', retrospective: '회고', diary: '일기' },
  dev: { work: '업무', til: 'TIL' },
};

// Noto Sans KR Bold 폰트 (프로젝트 내 번들)
const fontPath = path.resolve(process.cwd(), 'src/assets/fonts/NotoSansKR-Bold.ttf');
const fontData = fs.readFileSync(fontPath);

export async function getStaticPaths() {
  const posts = await getPublishedPosts();
  const slugMap = buildSlugMap(posts);
  return posts.map((post) => ({
    params: { slug: slugMap.get(post.id)! },
    props: { post },
  }));
}

export async function GET({ props }: APIContext) {
  const { post } = props as { post: Awaited<ReturnType<typeof getCollection>>[number] };
  const { title, description, category, subcategory, pubDate, bookTitle, bookAuthor } = post.data;
  const [gradFrom, gradTo] = CATEGORY_GRADIENTS[category] || ['#1e293b', '#334155'];
  const catLabel = CATEGORY_LABELS[category] || category;
  const subLabel = subcategory ? SUBCATEGORY_LABELS[category]?.[subcategory] : undefined;
  const dateStr = formatDate(pubDate);
  const svg = await satori(
    {
      type: 'div',
      props: {
        style: {
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '60px',
          background: `linear-gradient(135deg, ${gradFrom}, ${gradTo})`,
          fontFamily: 'NotoSansKR',
        },
        children: [
          // 상단: 카테고리
          {
            type: 'div',
            props: {
              style: {
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
              },
              children: [
                {
                  type: 'span',
                  props: {
                    style: {
                      backgroundColor: 'rgba(255,255,255,0.2)',
                      color: 'white',
                      padding: '8px 16px',
                      borderRadius: '8px',
                      fontSize: '24px',
                      fontWeight: 600,
                    },
                    children: catLabel,
                  },
                },
                subLabel ? {
                  type: 'span',
                  props: {
                    style: {
                      backgroundColor: 'rgba(255,255,255,0.15)',
                      color: 'rgba(255,255,255,0.9)',
                      padding: '8px 16px',
                      borderRadius: '8px',
                      fontSize: '20px',
                      fontWeight: 600,
                    },
                    children: subLabel,
                  },
                } : null,
              ].filter(Boolean),
            },
          },
          // 중앙: 제목 + 설명
          {
            type: 'div',
            props: {
              style: {
                display: 'flex',
                flexDirection: 'column',
                gap: '16px',
              },
              children: [
                {
                  type: 'div',
                  props: {
                    style: {
                      fontSize: title.length > 30 ? '40px' : '48px',
                      fontWeight: 700,
                      color: 'white',
                      lineHeight: 1.3,
                      wordBreak: 'break-word',
                    },
                    children: title,
                  },
                },
                description ? {
                  type: 'div',
                  props: {
                    style: {
                      fontSize: '24px',
                      color: 'rgba(255,255,255,0.8)',
                      lineHeight: 1.4,
                    },
                    children: description,
                  },
                } : null,
                bookTitle ? {
                  type: 'div',
                  props: {
                    style: {
                      fontSize: '22px',
                      color: 'rgba(255,255,255,0.7)',
                    },
                    children: `📖 ${bookTitle}${bookAuthor ? ` — ${bookAuthor}` : ''}`,
                  },
                } : null,
              ].filter(Boolean),
            },
          },
          // 하단: 블로그명 + 날짜
          {
            type: 'div',
            props: {
              style: {
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                borderTop: '1px solid rgba(255,255,255,0.3)',
                paddingTop: '24px',
              },
              children: [
                {
                  type: 'span',
                  props: {
                    style: { fontSize: '22px', color: 'rgba(255,255,255,0.8)' },
                    children: "Ethan's Blog",
                  },
                },
                {
                  type: 'span',
                  props: {
                    style: { fontSize: '22px', color: 'rgba(255,255,255,0.6)' },
                    children: dateStr,
                  },
                },
              ],
            },
          },
        ],
      },
    },
    {
      width: 1200,
      height: 630,
      fonts: [
        {
          name: 'NotoSansKR',
          data: fontData,
          weight: 700,
          style: 'normal' as const,
        },
      ],
    },
  );

  const resvg = new Resvg(svg, {
    fitTo: { mode: 'width', value: 1200 },
  });
  const pngData = resvg.render();
  const pngBuffer = pngData.asPng();

  return new Response(pngBuffer, {
    headers: { 'Content-Type': 'image/png' },
  });
}
