import fs from 'fs/promises';

const POSTS_FILE = 'src/data/posts.json';
const API_URL =
	process.env.WORDPRESS_POSTS_API_URL ||
	'https://nasuton.net/blog/wp-json/wp/v2/posts?per_page=3&_embed';
const RSS_URL = process.env.WORDPRESS_POSTS_RSS_URL || 'https://nasuton.net/blog/feed/';
const USER_AGENT =
	'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

async function checkRssAccess() {
	// Diagnose API-specific restrictions from the same runner; do not update posts from RSS.
	try {
		console.log(`[RSS diagnostic] Checking access to ${RSS_URL}...`);
		const res = await fetch(RSS_URL, {
			headers: {
				'User-Agent': USER_AGENT,
				'Accept': 'application/rss+xml, application/xml, text/xml, */*',
			},
			signal: AbortSignal.timeout(30000),
		});
		console.log(`[RSS diagnostic] HTTP status: ${res.status} ${res.statusText}`);
		console.log(`[RSS diagnostic] Content-Type: ${res.headers.get('content-type') || '(missing)'}`);
		const limit = 2000;
		const reader = res.body?.getReader();
		const decoder = new TextDecoder();
		let body = '';
		try {
			// Stop after the preview instead of waiting for the entire RSS feed.
			while (reader && body.length < limit) {
				const { done, value } = await reader.read();
				if (done) {
					body = (body + decoder.decode()).slice(0, limit);
					break;
				}
				body = (body + decoder.decode(value, { stream: true })).slice(0, limit);
			}
		} finally {
			// Preserve any bytes received even if reading the body times out.
			console.log(
				`[RSS diagnostic] Response body: ${JSON.stringify(body)}${body.length >= limit ? ' (stopped after 2000 characters)' : ''}`,
			);
			if (reader) {
				await reader.cancel().catch(() => {});
				reader.releaseLock();
			}
		}
	} catch (error) {
		console.warn(`[WARN] RSS diagnostic failed: ${error.message}`);
	}
}

async function fetchLatestPosts() {
	try {
		console.log(`Fetching latest posts from ${API_URL}...`);
		const res = await fetch(API_URL, {
			headers: {
				'User-Agent': USER_AGENT,
				'Accept': 'application/json, text/plain, */*',
			},
			signal: AbortSignal.timeout(10000),
		});

		const contentType = res.headers.get('content-type') || '';
		if (!res.ok || !contentType.includes('application/json')) {
			console.warn(`[WARN] Response Content-Type: ${contentType || '(missing)'}`);
			try {
				const body = await res.text();
				// Keep error pages readable without flooding GitHub Actions logs.
				const limit = 2000;
				console.warn(
					`[WARN] Response body: ${JSON.stringify(body.slice(0, limit))}${body.length > limit ? ' (truncated to 2000 characters)' : ''}`,
				);
			} catch (error) {
				console.warn(`[WARN] Could not read response body: ${error.message}`);
			}
			if (!res.ok) {
				throw new Error(`HTTP error ${res.status}: ${res.statusText}`);
			}
			throw new Error(`Unexpected Content-Type: ${contentType} (expected application/json)`);
		}

		const data = await res.json();
		if (!Array.isArray(data)) {
			throw new Error('API response is not an array');
		}

		const posts = data.map((p) => ({
			title: p.title?.rendered ?? '',
			url: p.link ?? '',
			date: p.date ?? '',
			excerpt: (p.excerpt?.rendered ?? '').replace(/<[^>]+>/g, '').slice(0, 100),
			thumb: p._embedded?.['wp:featuredmedia']?.[0]?.source_url ?? null,
		}));

		await fs.mkdir('src/data', { recursive: true });
		await fs.writeFile(POSTS_FILE, JSON.stringify(posts, null, 2) + '\n', 'utf-8');
		console.log(`Successfully fetched and saved ${posts.length} posts to ${POSTS_FILE}`);
	} catch (error) {
		console.warn(`[WARN] Failed to fetch latest posts: ${error.message}`);
		await checkRssAccess();

		// If posts.json already exists, preserve it so builds continue seamlessly
		try {
			await fs.access(POSTS_FILE);
			console.log(`Using existing ${POSTS_FILE} as fallback.`);
		} catch {
			// If file does not exist at all, write an empty array so Astro build doesn't break
			console.log(`No existing ${POSTS_FILE} found. Creating fallback empty file.`);
			await fs.mkdir('src/data', { recursive: true });
			await fs.writeFile(POSTS_FILE, JSON.stringify([], null, 2) + '\n', 'utf-8');
		}
	}
}

await fetchLatestPosts();
