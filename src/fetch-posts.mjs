import fs from 'fs/promises';

const res = await fetch('https://nasuton.net/blog/wp-json/wp/v2/posts?per_page=3&_embed');
const posts = (await res.json()).map(p => ({
    title: p.title.rendered,
    url: p.link,
    date: p.date,
    excerpt: p.excerpt.rendered.replace(/<[^>]+>/g, '').slice(0, 100),
    thumb: p._embedded?.['wp:featuredmedia']?.[0]?.source_url ?? null,
}));
await fs.writeFile('src/data/posts.json', JSON.stringify(posts, null, 2));