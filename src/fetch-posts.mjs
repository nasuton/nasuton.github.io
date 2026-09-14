import fs from 'fs/promises';

const POSTS_FILE = 'src/data/posts.json';
const API_URL =
	process.env.WORDPRESS_POSTS_API_URL ||
	'https://nasuton.net/blog/wp-json/wp/v2/posts?per_page=3&_embed';

async function fetchLatestPosts() {
	try {
		console.log(`Fetching latest posts from ${API_URL}...`);
		const res = await fetch(API_URL, {
			headers: {
				'User-Agent':
					'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
				'Accept': 'application/json, text/plain, */*',
			},
			signal: AbortSignal.timeout(10000),
		});

		if (!res.ok) {
			throw new Error(`HTTP error ${res.status}: ${res.statusText}`);
		}

		const contentType = res.headers.get('content-type') || '';
		if (!contentType.includes('application/json')) {
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