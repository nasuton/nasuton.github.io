import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';
import { readRssPosts } from '../src/lib/rss-posts.mjs';
import * as relatedPosts from '../src/lib/related-posts.mjs';

const source = await readFile(new URL('../src/build-related.mjs', import.meta.url), 'utf8');
const relatedFile = 'src/data/related.json';
const start = '<rss xmlns:content="http://purl.org/rss/1.0/modules/content/"><channel><title>ブログ</title>';
const item = (n) => `<item><title>記事${n} 非同期処理を実装する</title><link>https://example.com/${n}</link>`
	+ `<pubDate>Thu, ${String(1 + (n % 28)).padStart(2, '0')} Sep 2026 01:00:00 +0000</pubDate><description>概要</description>`
	+ `<category><![CDATA[技術]]></category><category>${n % 2 ? 'Python' : 'Go'}</category>`
	+ `<content:encoded><![CDATA[<p>本文${n} 非同期処理 await</p><pre>code${n}</pre>]]></content:encoded></item>`;
const page = (numbers) => `${start}${numbers.map(item).join('')}</channel></rss>`;

// The feed is served 10 items per page; the page after the last one answers 404 like WordPress.
async function run({ total = 25, minCount = 20, failPage = null, emptyLastPage = false, noCache = false } = {}) {
	const original = '[{"title":"cached","url":"https://example.com/cached","related":[]}]\n';
	const files = new Map(noCache ? [] : [[relatedFile, original]]);
	const requests = [];
	const logs = [];
	const delays = [];
	const pages = Math.ceil(total / 10);
	const context = vm.createContext({
		TextDecoder, AbortSignal, URL,
		setTimeout: (fn, ms) => { delays.push(ms); fn(); },
		process: { env: { WORDPRESS_POSTS_RSS_URL: 'https://example.com/feed/', RELATED_POSTS_MIN_COUNT: String(minCount) } },
		console: { log: (s) => logs.push(s), warn: (s) => logs.push(s) },
		fetch: async (url) => {
			requests.push(url);
			const n = Number(new URL(url).searchParams.get('paged') ?? 1);
			if (n === failPage) throw new DOMException('Timed out', 'TimeoutError');
			if (n > pages + (emptyLastPage ? 1 : 0)) return new Response('Not Found', { status: 404 });
			if (n > pages) return new Response(`${start}</channel></rss>`, { headers: { 'Content-Type': 'application/rss+xml' } });
			const first = (n - 1) * 10 + 1;
			const numbers = Array.from({ length: Math.min(10, total - first + 1) }, (_, i) => first + i);
			return new Response(page(numbers), { headers: { 'Content-Type': 'application/rss+xml; charset=UTF-8' } });
		},
	});
	const fsMock = {
		access: async (path) => { if (!files.has(path)) throw new Error('ENOENT'); },
		mkdir: async () => {},
		writeFile: async (path, content) => files.set(path, content),
	};
	const fsModule = new vm.SyntheticModule(['default'], function () { this.setExport('default', fsMock); }, { context });
	const rssModule = new vm.SyntheticModule(['readRssPosts'], function () { this.setExport('readRssPosts', readRssPosts); }, { context });
	const relatedModule = new vm.SyntheticModule(Object.keys(relatedPosts), function () {
		for (const [name, value] of Object.entries(relatedPosts)) this.setExport(name, value);
	}, { context });
	const module = new vm.SourceTextModule(source, { context });
	await module.link((specifier) => {
		if (specifier === 'fs/promises') return fsModule;
		if (specifier === './lib/rss-posts.mjs') return rssModule;
		assert.equal(specifier, './lib/related-posts.mjs');
		return relatedModule;
	});
	await module.evaluate();
	return { files, requests, logs, delays, original };
}

test('crawls every page until 404, de-duplicates, and writes a minified index sorted by date', async () => {
	const { files, requests, delays, logs } = await run();
	assert.deepEqual(requests, [
		'https://example.com/feed/',
		'https://example.com/feed/?paged=2',
		'https://example.com/feed/?paged=3',
		'https://example.com/feed/?paged=4',
	]);
	assert.deepEqual(delays, [300, 300, 300]);
	const json = files.get(relatedFile);
	assert.ok(!json.includes('\n  '), 'minified');
	const index = JSON.parse(json);
	assert.equal(index.length, 25);
	assert.deepEqual(Object.keys(index[0]), ['url', 'title', 'date', 'categories', 'related']);
	assert.ok(index.every((e) => e.categories[0] === '技術' && ['Python', 'Go'].includes(e.categories[1])));
	assert.ok(index.every((e) => e.related.every((r) => r.url !== e.url && r.score >= 0.08)));
	assert.ok(index.every((e, i) => i === 0 || index[i - 1].date >= e.date), 'sorted by date desc');
	assert.ok(!json.includes('本文'), 'article bodies are not published');
	assert.ok(logs.some((s) => s.includes('Successfully built related-posts index for 25 posts')));
});

test('an empty page also ends the crawl', async () => {
	const { files, requests } = await run({ emptyLastPage: true });
	assert.equal(requests.length, 4);
	assert.equal(JSON.parse(files.get(relatedFile)).length, 25);
});

test('too few posts keeps the committed index instead of publishing a degraded one', async () => {
	const { files, original, logs } = await run({ total: 25, minCount: 140 });
	assert.equal(files.get(relatedFile), original);
	assert.ok(logs.some((s) => s.includes('[WARN]') && s.includes('only 25 posts')));
});

test('a failing page keeps the committed index, or creates an empty file on the first run', async () => {
	const failed = await run({ failPage: 2 });
	assert.equal(failed.files.get(relatedFile), failed.original);
	assert.ok(failed.logs.some((s) => s.includes('[WARN]') && s.includes('Timed out')));
	const empty = await run({ failPage: 2, noCache: true });
	assert.deepEqual(JSON.parse(empty.files.get(relatedFile)), []);
});
