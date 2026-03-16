import { getCollection } from 'astro:content';

/** 공개 가능한 글만 필터링 (draft 제외 + 미래 pubDate 제외) */
export async function getPublishedPosts() {
  const now = new Date();
  return (await getCollection('posts')).filter(
    (p) => !p.data.draft && p.data.pubDate <= now,
  );
}
