import fs from 'fs/promises';
import { readRssPosts } from './lib/rss-posts.mjs';
import { buildRelatedIndex } from './lib/related-posts.mjs';

// The WordPress REST API returns 403 from datacenter IPs such as GitHub Actions runners, but the
// RSS feed is reachable and supports ?paged=N, so the whole archive is crawled 10 posts at a time.
const RELATED_FILE = 'src/data/related.json';
const RSS_URL = process.env.WORDPRESS_POSTS_RSS_URL || 'https://nasuton.net/blog/feed/';
// Never publish a degraded index: keep the committed file unless the crawl looks complete.
const MIN_POSTS = Number(process.env.RELATED_POSTS_MIN_COUNT) || 140;
const MAX_PAGES = 200;
const PAGE_DELAY_MS = 300;
const USER_AGENT =
	'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function pageUrl(page) {
	if (page === 1) return RSS_URL;
	const url = new URL(RSS_URL);
	url.searchParams.set('paged', String(page));
	return url.href;
}

// Returns null when the feed has no more pages (WordPress answers 404 past the last page).
async function fetchPage(page) {
	const url = pageUrl(page);
	const res = await fetch(url, {
		headers: { 'User-Agent': USER_AGENT, 'Accept': 'application/rss+xml, application/xml, text/xml, */*' },
		signal: AbortSignal.timeout(60000),
	});
	if (res.status === 404) {
		await res.body?.cancel().catch(() => {});
		return null;
	}
	const contentType = res.headers.get('content-type') || '';
	if (!res.ok || !/^(application\/(rss\+xml|xml)|text\/xml)(\s*;|$)/i.test(contentType)) {
		throw new Error(`RSS HTTP ${res.status} ${res.statusText}; Content-Type: ${contentType || '(missing)'} (${url})`);
	}
	try {
		return await readRssPosts(res.body, { limit: Infinity, fullContent: true, categories: true });
	} catch (error) {
		if (page > 1 && /no posts/.test(error.message)) return null;
		throw error;
	}
}

async function fetchAllPosts() {
	const posts = [];
	const seen = new Set();
	for (let page = 1; page <= MAX_PAGES; page++) {
		const items = await fetchPage(page);
		if (items === null) break;
		for (const item of items) {
			if (seen.has(item.url)) continue;
			seen.add(item.url);
			posts.push(item);
		}
		console.log(`[RSS] page ${page}: ${items.length} items (total ${posts.length})`);
		await sleep(PAGE_DELAY_MS); // be polite to the origin
	}
	return posts;
}

async function preserveExistingIndex() {
	try {
		await fs.access(RELATED_FILE);
		console.log(`Using existing ${RELATED_FILE} as fallback.`);
	} catch {
		console.log(`No existing ${RELATED_FILE} found. Creating fallback empty file.`);
		await fs.mkdir('src/data', { recursive: true });
		await fs.writeFile(RELATED_FILE, '[]\n', 'utf-8');
	}
}

async function buildRelated() {
	try {
		console.log(`Fetching all posts from ${RSS_URL}...`);
		const posts = await fetchAllPosts();
		if (posts.length < MIN_POSTS) {
			throw new Error(`only ${posts.length} posts were fetched (expected at least ${MIN_POSTS})`);
		}
		const { index, vocabularySize } = buildRelatedIndex(posts);
		const scores = index.flatMap((entry) => entry.related.map((r) => r.score));
		const empty = index.filter((entry) => entry.related.length === 0).length;
		console.log(`Documents ${index.length} / vocabulary ${vocabularySize}`);
		console.log(`Recommendations ${scores.length} / posts without recommendations ${empty}`);
		if (scores.length > 0) {
			const mean = scores.reduce((sum, s) => sum + s, 0) / scores.length;
			console.log(`Similarity mean ${mean.toFixed(3)} / min ${Math.min(...scores).toFixed(3)} / max ${Math.max(...scores).toFixed(3)}`);
		}
		await fs.mkdir('src/data', { recursive: true });
		await fs.writeFile(RELATED_FILE, JSON.stringify(index) + '\n', 'utf-8');
		console.log(`Successfully built related-posts index for ${index.length} posts to ${RELATED_FILE}`);
	} catch (error) {
		console.warn(`[WARN] Failed to build related-posts index: ${error.message}`);
		await preserveExistingIndex();
	}
}

await buildRelated();
