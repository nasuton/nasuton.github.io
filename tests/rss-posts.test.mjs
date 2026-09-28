import assert from 'node:assert/strict';
import test from 'node:test';
import { readRssPosts } from '../src/lib/rss-posts.mjs';

const item = (number, extra = '') => `<item>
<title>記事${number} &amp; XML &#060;Go&gt;</title>
<link>https://example.com/posts/${number}</link>
<pubDate>Tue, 15 Sep 2026 00:00:00 +0000</pubDate>
<description><![CDATA[<p>説明${number}</p>]]></description>
<content:encoded><![CDATA[${'<p>本文</p>'.repeat(1000)}<item>本文内の例</item>]]></content:encoded>
${extra}</item>`;
const start = '<rss xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:media="http://search.yahoo.com/mrss/"><channel><title>ブログ名</title>';
const feed = (items) => `${start}${items}</channel></rss>`;
const body = (xml) => new Response(xml).body;

test('extracts exactly three posts beyond the old 2000-character preview', async () => {
	const posts = await readRssPosts(body(feed([1, 2, 3, 4].map((n) => item(n)).join(''))));
	assert.equal(posts.length, 3);
	assert.deepEqual(posts.map((p) => p.url), [1, 2, 3].map((n) => `https://example.com/posts/${n}`));
	assert.deepEqual(posts[0], {
		title: '記事1 & XML <Go>', url: 'https://example.com/posts/1',
		date: '2026-09-15T00:00:00.000Z', excerpt: '説明1', thumb: null,
	});
	assert.ok(!JSON.stringify(posts).includes('本文'));
});

test('cancels a stream after three complete items without waiting for the rest', { timeout: 1000 }, async () => {
	let cancelled = false;
	const stream = new ReadableStream({
		start(controller) { controller.enqueue(new TextEncoder().encode(start + [1, 2, 3].map((n) => item(n)).join(''))); },
		cancel() { cancelled = true; },
	});
	assert.equal((await readRssPosts(stream)).length, 3);
	assert.equal(cancelled, true);
});

test('handles UTF-8 and XML tags split across network chunks', async () => {
	const bytes = new TextEncoder().encode(feed(item(1, '<media:thumbnail url="https://example.com/thumb.jpg"/>')));
	let offset = 0;
	const stream = new ReadableStream({
		pull(controller) {
			if (offset === bytes.length) controller.close();
			else {
				controller.enqueue(bytes.slice(offset, offset + 7));
				offset = Math.min(offset + 7, bytes.length);
			}
		},
	});
	const posts = await readRssPosts(stream);
	assert.equal(posts[0].title, '記事1 & XML <Go>');
	assert.equal(posts[0].thumb, 'https://example.com/thumb.jpg');
});

test('rejects truncated XML instead of saving incomplete results', async () => {
	await assert.rejects(readRssPosts(body(start + item(1) + '<item><title>途中')));
});

test('propagates body timeouts instead of saving partial results', async () => {
	let first = true;
	const stream = new ReadableStream({
		pull(controller) {
			if (first) { first = false; controller.enqueue(new TextEncoder().encode(start + item(1))); }
			else controller.error(new DOMException('RSS timed out', 'TimeoutError'));
		},
	}, { highWaterMark: 0 });
	await assert.rejects(readRssPosts(stream), /RSS timed out/);
});

test('rejects empty feeds, HTML error pages, and invalid dates', async () => {
	await assert.rejects(readRssPosts(body(feed(''))), /no posts/);
	await assert.rejects(readRssPosts(body('<html><body>Forbidden</body></html>')), /no posts/);
	await assert.rejects(readRssPosts(body(feed(item(1).replace('Tue, 15 Sep 2026 00:00:00 +0000', 'invalid')))), /invalid/);
});

test('does not parse unnecessary data after the third item', async () => {
	const posts = await readRssPosts(body(start + [1, 2, 3].map((n) => item(n)).join('') + '<malformed'));
	assert.equal(posts.length, 3);
});

test('photo feeds stop after five complete items, while the default remains three', { timeout: 1000 }, async () => {
	const xml = start + [1, 2, 3, 4, 5].map((n) => item(n)).join('');
	let cancelled = false;
	const stream = new ReadableStream({
		start(controller) { controller.enqueue(new TextEncoder().encode(xml)); },
		cancel() { cancelled = true; },
	});
	assert.equal((await readRssPosts(stream, { limit: 5 })).length, 5);
	assert.equal(cancelled, true);
	assert.equal((await readRssPosts(body(xml))).length, 3);
});

test('photo thumbnails prefer gallery images over related-article thumbnails', async () => {
	const html = '<img src="https://example.com/related.jpg"><img class="st-gallery-slide__image" src="/photo.jpg?a=1&amp;b=2">';
	const xml = feed(item(1).replace('<p>本文</p>', html));
	assert.equal((await readRssPosts(body(xml), { contentImages: true }))[0].thumb, 'https://example.com/photo.jpg?a=1&b=2');
	assert.equal((await readRssPosts(body(xml)))[0].thumb, null);
});

test('a feed with fewer than five items returns available posts and rejects a truncated fifth item', async () => {
	assert.equal((await readRssPosts(body(feed(item(1))), { limit: 5 })).length, 1);
	await assert.rejects(readRssPosts(body(start + [1, 2, 3, 4].map((n) => item(n)).join('') + '<item>'), { limit: 5 }));
	await assert.rejects(readRssPosts(body(feed(item(1))), { limit: 0 }), /positive integer/);
});

test('limit: Infinity reads every item and the defaults still omit categories and bodies', async () => {
	const xml = feed([1, 2, 3, 4, 5, 6, 7].map((n) => item(n)).join(''));
	const posts = await readRssPosts(body(xml), { limit: Infinity });
	assert.equal(posts.length, 7);
	assert.deepEqual(Object.keys(posts[0]), ['title', 'url', 'date', 'excerpt', 'thumb']);
	await assert.rejects(readRssPosts(body(xml), { limit: -Infinity }), /positive integer/);
	await assert.rejects(readRssPosts(body(xml), { limit: 2.5 }), /positive integer/);
});

test('fullContent keeps the whole article HTML and categories collects unique <category> names', async () => {
	const extra = '<category><![CDATA[技術]]></category><category>Python</category><category> 技術 </category><category></category>';
	const xml = feed(item(1, extra) + item(2));
	const posts = await readRssPosts(body(xml), { limit: Infinity, fullContent: true, categories: true });
	assert.deepEqual(posts[0].categories, ['技術', 'Python']);
	assert.deepEqual(posts[1].categories, []);
	assert.equal(posts[0].content, '<p>本文</p>'.repeat(1000) + '<item>本文内の例</item>');
	assert.equal(posts[0].thumb, null);

	const onlyCategories = await readRssPosts(body(xml), { categories: true });
	assert.deepEqual(Object.keys(onlyCategories[0]), ['title', 'url', 'date', 'excerpt', 'thumb', 'categories']);
	const onlyContent = await readRssPosts(body(xml), { fullContent: true });
	assert.deepEqual(Object.keys(onlyContent[0]), ['title', 'url', 'date', 'excerpt', 'thumb', 'content']);
});

test('fullContent is not truncated at 256KB while contentImages still is', async () => {
	const big = '<p>本文</p>'.repeat(40000); // > 256KB of UTF-8 text
	const xml = feed(item(1).replace('<p>本文</p>'.repeat(1000), big));
	const [full] = await readRssPosts(body(xml), { fullContent: true });
	assert.equal(full.content.length, big.length + '<item>本文内の例</item>'.length);
	const [photo] = await readRssPosts(body(xml), { contentImages: true });
	assert.equal(photo.content, undefined);
});
