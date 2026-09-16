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
