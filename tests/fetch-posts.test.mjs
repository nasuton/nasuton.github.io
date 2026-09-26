import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';
import { readRssPosts } from '../src/lib/rss-posts.mjs';

const source = await readFile(new URL('../src/fetch-posts.mjs', import.meta.url), 'utf8');
const techFile = 'src/data/posts.json';
const photoFile = 'src/data/photo-posts.json';
const feed = (type) => '<rss><channel>' + [1, 2, 3, 4, 5, 6].map((n) =>
	`<item><title>${type} ${n}</title><link>https://example.com/${type}/${n}</link><pubDate>Thu, 24 Sep 2026 01:00:00 +0000</pubDate><description>Summary</description></item>`,
).join('') + '</channel></rss>';

async function run({ techFails = false, photoFails = false, apiWorks = false, noCache = false, truncatedPhoto = false } = {}) {
	const originalTech = '[{"title":"cached tech","url":"https://example.com/tech/1","thumb":"https://example.com/tech.jpg"}]\n';
	const originalPhoto = '[{"title":"cached photo","url":"https://example.com/photo/1","thumb":"https://example.com/photo.jpg"}]\n';
	const files = new Map(noCache ? [] : [[techFile, originalTech], [photoFile, originalPhoto]]);
	const requests = [];
	const logs = [];
	const context = vm.createContext({
		TextDecoder, AbortSignal,
		process: { env: { WORDPRESS_POSTS_API_URL: 'https://example.com/api', WORDPRESS_POSTS_RSS_URL: 'https://example.com/tech-feed', PHOTO_POSTS_RSS_URL: 'https://example.com/photo-feed' } },
		console: { log: (s) => logs.push(s), warn: (s) => logs.push(s) },
		fetch: async (url) => {
			requests.push(url);
			if (url.endsWith('/api')) {
				return apiWorks
					? new Response(JSON.stringify([1, 2, 3, 4].map((n) => ({ title: { rendered: `API ${n}` } }))), { headers: { 'Content-Type': 'application/json' } })
					: new Response('Forbidden', { status: 403 });
			}
			const isPhoto = url.endsWith('/photo-feed');
			if (isPhoto ? photoFails : techFails) throw new DOMException('Timed out', 'TimeoutError');
			const xml = isPhoto && truncatedPhoto ? '<rss><channel><item>' : feed(isPhoto ? 'photo' : 'tech');
			return new Response(xml, { headers: { 'Content-Type': 'application/rss+xml' } });
		},
	});
	const fsMock = {
		access: async (path) => { if (!files.has(path)) throw new Error('ENOENT'); },
		readFile: async (path) => { if (!files.has(path)) throw new Error('ENOENT'); return files.get(path); },
		mkdir: async () => {},
		writeFile: async (path, content) => files.set(path, content),
	};
	const fsModule = new vm.SyntheticModule(['default'], function () { this.setExport('default', fsMock); }, { context });
	const rssModule = new vm.SyntheticModule(['readRssPosts'], function () { this.setExport('readRssPosts', readRssPosts); }, { context });
	const module = new vm.SourceTextModule(source, { context });
	await module.link((specifier) => {
		if (specifier === 'fs/promises') return fsModule;
		assert.equal(specifier, './lib/rss-posts.mjs');
		return rssModule;
	});
	await module.evaluate();
	return { files, requests, logs, originalTech, originalPhoto };
}

test('saves three tech posts and five photo posts to separate files', async () => {
	const { files, requests, logs } = await run();
	assert.equal(JSON.parse(files.get(techFile)).length, 3);
	assert.equal(JSON.parse(files.get(photoFile)).length, 5);
	assert.equal(JSON.parse(files.get(photoFile))[0].thumb, 'https://example.com/photo.jpg');
	assert.deepEqual(requests, ['https://example.com/api', 'https://example.com/tech-feed', 'https://example.com/photo-feed']);
	assert.ok(logs.some((s) => s.includes('saved 5 photo posts')));
});

test('photo RSS is fetched even when the tech API succeeds', async () => {
	const { files, requests } = await run({ apiWorks: true });
	assert.equal(JSON.parse(files.get(techFile)).length, 3);
	assert.equal(JSON.parse(files.get(photoFile)).length, 5);
	assert.equal(requests.length, 2);
});

test('tech failure preserves its cache while photo posts update', async () => {
	const { files, originalTech } = await run({ techFails: true });
	assert.equal(files.get(techFile), originalTech);
	assert.equal(JSON.parse(files.get(photoFile)).length, 5);
});

test('photo failure or incomplete RSS preserves its cache while tech posts update', async () => {
	for (const options of [{ photoFails: true }, { truncatedPhoto: true }]) {
		const { files, originalPhoto } = await run(options);
		assert.equal(files.get(photoFile), originalPhoto);
		assert.equal(JSON.parse(files.get(techFile)).length, 3);
	}
});

test('both failures preserve existing files, or create empty files on the first run', async () => {
	const result = await run({ techFails: true, photoFails: true });
	assert.equal(result.files.get(techFile), result.originalTech);
	assert.equal(result.files.get(photoFile), result.originalPhoto);
	const empty = await run({ techFails: true, photoFails: true, noCache: true });
	assert.deepEqual(JSON.parse(empty.files.get(techFile)), []);
	assert.deepEqual(JSON.parse(empty.files.get(photoFile)), []);
});
