import fs from 'fs/promises';
import { readRssPosts } from './lib/rss-posts.mjs';

const POSTS_FILE = 'src/data/posts.json';
const API_URL =
	process.env.WORDPRESS_POSTS_API_URL ||
	'https://nasuton.net/blog/wp-json/wp/v2/posts?per_page=3&_embed';
const RSS_URL = process.env.WORDPRESS_POSTS_RSS_URL || 'https://nasuton.net/blog/feed/';
const USER_AGENT =
	'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

async function logResponsePreview(res, label) {
	console.warn(`[${label}] Content-Type: ${res.headers.get('content-type') || '(missing)'}`);
	const reader = res.body?.getReader();
	const decoder = new TextDecoder();
	const limit = 2000;
	let body = '';
	try {
		while (reader && body.length < limit) {
			const { done, value } = await reader.read();
			if (done) {
				body = (body + decoder.decode()).slice(0, limit);
				break;
			}
			body = (body + decoder.decode(value, { stream: true })).slice(0, limit);
		}
	} catch (error) {
		console.warn(`[${label}] Could not read response body: ${error.message}`);
	} finally {
		console.warn(`[${label}] Response body: ${JSON.stringify(body)}${body.length >= limit ? ' (stopped after 2000 characters)' : ''}`);
		if (reader) {
			await reader.cancel().catch(() => {});
			reader.releaseLock();
		}
	}
}

async function fetchApiPosts() {
	console.log(`Fetching latest posts from ${API_URL}...`);
	const res = await fetch(API_URL, {
		headers: { 'User-Agent': USER_AGENT, 'Accept': 'application/json, text/plain, */*' },
		signal: AbortSignal.timeout(10000),
	});
	const contentType = res.headers.get('content-type') || '';
	if (!res.ok || !contentType.includes('application/json')) {
		await logResponsePreview(res, 'API');
		throw new Error(`HTTP ${res.status} ${res.statusText}; Content-Type: ${contentType || '(missing)'}`);
	}
	const data = await res.json();
	if (!Array.isArray(data) || data.length === 0) throw new Error('API response contains no posts');
	return data.slice(0, 3).map((p) => ({
		title: p.title?.rendered ?? '',
		url: p.link ?? '',
		date: p.date ?? '',
		excerpt: (p.excerpt?.rendered ?? '').replace(/<[^>]+>/g, '').slice(0, 100),
		thumb: p._embedded?.['wp:featuredmedia']?.[0]?.source_url ?? null,
	}));
}

async function fetchRssPosts() {
	console.log(`[RSS] Fetching latest posts from ${RSS_URL}...`);
	const res = await fetch(RSS_URL, {
		headers: { 'User-Agent': USER_AGENT, 'Accept': 'application/rss+xml, application/xml, text/xml, */*' },
		signal: AbortSignal.timeout(60000),
	});
	const contentType = res.headers.get('content-type') || '';
	console.log(`[RSS] HTTP status: ${res.status} ${res.statusText}`);
	console.log(`[RSS] Content-Type: ${contentType || '(missing)'}`);
	if (!res.ok || !/^(application\/(rss\+xml|xml)|text\/xml)(\s*;|$)/i.test(contentType)) {
		await logResponsePreview(res, 'RSS');
		throw new Error(`RSS HTTP ${res.status} ${res.statusText}; Content-Type: ${contentType || '(missing)'}`);
	}
	const posts = await readRssPosts(res.body);
	// Standard WordPress feeds may omit featured images; retain known thumbnails by URL.
	try {
		const previous = JSON.parse(await fs.readFile(POSTS_FILE, 'utf-8'));
		for (const post of posts) {
			post.thumb ??= previous.find((old) => old.url === post.url)?.thumb ?? null;
		}
	} catch {
		// A missing or invalid cache does not prevent fetching new posts.
	}
	console.log(`[RSS] Parsed ${posts.length} posts: ${JSON.stringify(posts.map((post) => post.title))}`);
	return posts;
}

async function fetchLatestPosts() {
	try {
		let posts;
		let source = 'API';
		try {
			posts = await fetchApiPosts();
		} catch (error) {
			console.warn(`[WARN] API fetch failed: ${error.message}. Trying RSS...`);
			source = 'RSS';
			posts = await fetchRssPosts();
		}
		await fs.mkdir('src/data', { recursive: true });
		await fs.writeFile(POSTS_FILE, JSON.stringify(posts, null, 2) + '\n', 'utf-8');
		console.log(`Successfully fetched and saved ${posts.length} posts from ${source} to ${POSTS_FILE}`);
	} catch (error) {
		console.warn(`[WARN] Failed to fetch latest posts: ${error.message}`);
		try {
			await fs.access(POSTS_FILE);
			console.log(`Using existing ${POSTS_FILE} as fallback.`);
		} catch {
			console.log(`No existing ${POSTS_FILE} found. Creating fallback empty file.`);
			await fs.mkdir('src/data', { recursive: true });
			await fs.writeFile(POSTS_FILE, '[]\n', 'utf-8');
		}
	}
}

await fetchLatestPosts();
