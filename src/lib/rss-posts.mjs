import sax from 'sax';

// WordPress lists its newest posts first. Parse complete items, not a byte preview.
export async function readRssPosts(stream) {
	if (!stream) throw new Error('RSS response has no body');
	const posts = [];
	const stack = [];
	const complete = Symbol('three complete RSS items');
	const parser = sax.parser(true, { strictEntities: true });
	let item = null;

	parser.onerror = (error) => { throw error; };
	parser.onopentag = (node) => {
		stack.push(node.name);
		if (stack.join('/') === 'rss/channel/item') {
			item = { title: '', link: '', pubDate: '', description: '', thumb: null };
		} else if (item && stack.length === 4 && node.name === 'media:thumbnail') {
			item.thumb = node.attributes.url || null;
		}
	};
	const collectText = (text) => {
		const field = stack.at(-1);
		if (item && stack.length === 4 && ['title', 'link', 'pubDate', 'description'].includes(field)) {
			item[field] += text;
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
				thumb: item.thumb,
			});
			item = null;
			if (posts.length === 3) throw complete;
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
