import sax from 'sax';

// WordPress lists its newest posts first. Parse complete items, not a byte preview.
export async function readRssPosts(stream, { limit = 3, contentImages = false } = {}) {
	if (!Number.isInteger(limit) || limit < 1) throw new Error('RSS limit must be a positive integer');
	if (!stream) throw new Error('RSS response has no body');
	const posts = [];
	const stack = [];
	const complete = Symbol('requested RSS items complete');
	const parser = sax.parser(true, { strictEntities: true });
	let item = null;

	parser.onerror = (error) => { throw error; };
	parser.onopentag = (node) => {
		stack.push(node.name);
		if (stack.join('/') === 'rss/channel/item') {
			item = { title: '', link: '', pubDate: '', description: '', content: '', thumb: null };
		} else if (item && stack.length === 4 && node.name === 'media:thumbnail') {
			item.thumb = node.attributes.url || null;
		}
	};
	const collectText = (text) => {
		const field = stack.at(-1);
		if (item && stack.length === 4 && ['title', 'link', 'pubDate', 'description'].includes(field)) {
			item[field] += text;
		} else if (contentImages && item && stack.length === 4 && field === 'content:encoded') {
			// Only keep enough HTML to locate a photo; never save the article body.
			item.content = (item.content + text).slice(0, 256000);
		}
	};
	parser.ontext = collectText;
	parser.oncdata = collectText;
	parser.onclosetag = () => {
		if (item && stack.join('/') === 'rss/channel/item') {
			const date = new Date(item.pubDate.trim());
			const url = new URL(item.link.trim());
			if (!item.title.trim() || Number.isNaN(date.getTime()) || !['http:', 'https:'].includes(url.protocol)) {
				throw new Error('RSS item has an invalid title, link, or publication date');
			}
			posts.push({
				title: item.title.trim(),
				url: url.href,
				date: date.toISOString(),
				excerpt: item.description.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim().slice(0, 100),
				thumb: item.thumb || (contentImages ? findContentImage(item.content, url.href) : null),
			});
			item = null;
			if (posts.length === limit) throw complete;
		}
		stack.pop();
	};

	const reader = stream.getReader();
	const decoder = new TextDecoder();
	try {
		while (true) {
			const { done, value } = await reader.read();
			if (done) {
				parser.write(decoder.decode()).close();
				break;
			}
			parser.write(decoder.decode(value, { stream: true }));
		}
	} catch (error) {
		if (error !== complete) throw error;
	} finally {
		await reader.cancel().catch(() => {});
		reader.releaseLock();
	}
	if (posts.length === 0) throw new Error('RSS feed contains no posts');
	return posts;
}

function findContentImage(html, baseUrl) {
	const images = html.match(/<img\b[^>]*>/gi) || [];
	// Prefer article/gallery photos over thumbnails in related-article links.
	const preferred = images.filter((tag) => /\bclass\s*=\s*["'][^"']*\b(?:st-gallery-slide__image|wp-image-\d+)\b/i.test(tag));
	for (const tag of [...preferred, ...images]) {
		const src = tag.match(/\bsrc\s*=\s*(["'])(.*?)\1/i)?.[2];
		if (!src) continue;
		try {
			const url = new URL(src.replace(/&amp;/g, '&'), baseUrl);
			if (['http:', 'https:'].includes(url.protocol)) return url.href;
		} catch {
			// Ignore malformed image URLs and try the next image.
		}
	}
	return null;
}
