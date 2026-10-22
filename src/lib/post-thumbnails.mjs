// WordPress RSS feeds do not always include the article's featured image.
export function extractOpenGraphImage(html, baseUrl) {
	const head = html.split(/<\/head\s*>/i)[0]
		.replace(/<!--[\s\S]*?-->/g, '')
		.replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, '');
	const tags = head.match(/<meta\b(?:[^"'<>]|"[^"]*"|'[^']*')*>/gi) || [];
	for (const tag of tags) {
		const attrs = Object.fromEntries([...tag.matchAll(/([^\s=<>]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g)]
			.map((match) => [match[1].toLowerCase(), match[2] ?? match[3] ?? match[4]]));
		if ((attrs.property || attrs.name || '').toLowerCase() !== 'og:image' || !attrs.content?.trim()) continue;
		const content = attrs.content.replace(/&(?:#(\d+)|#x([0-9a-f]+)|(amp|quot|apos|lt|gt));/gi, (entity, decimal, hex, name) => {
			if (name) return { amp: '&', quot: '"', apos: "'", lt: '<', gt: '>' }[name.toLowerCase()];
			const code = decimal ? Number(decimal) : parseInt(hex, 16);
			return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : entity;
		});
		try {
			const image = new URL(content.trim(), baseUrl);
			if (['http:', 'https:'].includes(image.protocol)) return image.href;
		} catch {
			// Try the next metadata tag if this URL is malformed.
		}
	}
	return null;
}

export async function fetchPostThumbnail(url, { headers, fetchImpl = fetch } = {}) {
	const res = await fetchImpl(url, {
		headers: { ...headers, Accept: 'text/html, application/xhtml+xml' },
		signal: AbortSignal.timeout(10000),
	});
	let reader;
	try {
		if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
		const contentType = res.headers.get('content-type') || '';
		if (!/^(text\/html|application\/xhtml\+xml)(\s*;|$)/i.test(contentType)) {
			throw new Error(`Unexpected Content-Type: ${contentType || '(missing)'}`);
		}
		if (!res.body) throw new Error('Article response has no body');
		reader = res.body.getReader();
		const decoder = new TextDecoder();
		let html = '';
		// Metadata is in the head; stop early to avoid downloading the entire article.
		while (html.length < 256000 && !/<\/head\s*>/i.test(html)) {
			const { done, value } = await reader.read();
			if (done) {
				html += decoder.decode();
				break;
			}
			html = (html + decoder.decode(value, { stream: true })).slice(0, 256000);
		}
		return extractOpenGraphImage(html, res.url || url);
	} finally {
		if (reader) {
			await reader.cancel().catch(() => {});
			reader.releaseLock();
		} else {
			await res.body?.cancel().catch(() => {});
		}
	}
}
