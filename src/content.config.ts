import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const posts = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/posts' }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    category: z.enum(['reading', 'essay', 'dev']),
    subcategory: z.string().optional(),
    tags: z.array(z.string()).default([]),
    pubDate: z.coerce.date(),
    updatedDate: z.coerce.date().optional(),
    draft: z.boolean().default(false),
    // 독서 카테고리 전용
    bookTitle: z.string().optional(),
    bookAuthor: z.string().optional(),
    rating: z.number().min(1).max(5).optional(),
    // 공통 선택
    heroImage: z.string().optional(),
    heroImageOnly: z.boolean().default(false), // true면 PostCard 썸네일로만 사용, 본문에선 숨김
    // 코딩 카테고리 전용
    series: z.string().optional(),
  }),
});

export const collections = { posts };
