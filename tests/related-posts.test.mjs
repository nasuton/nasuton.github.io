import assert from 'node:assert/strict';
import test from 'node:test';
import {
	buildRelatedIndex,
	buildTfidf,
	cosineSimilarity,
	decodeEntities,
	inverseDocumentFrequencies,
	normalise,
	stripHtml,
	termFrequencies,
	tfidfVector,
	toIsoDate,
	tokenize,
} from '../src/lib/related-posts.mjs';

const close = (actual, expected, message) => assert.ok(Math.abs(actual - expected) < 1e-9, `${message ?? ''} expected ${expected}, got ${actual}`);

test('stripHtml removes code blocks with their contents, other tags, and entities', () => {
	const html = '<p>本文 &amp; <b>強調</b></p><pre class="x">int main() {}</pre><code>fmt.Println</code>'
		+ '<script>alert(1)</script><style>a{}</style><p>続き&#8230;&#x41;&nbsp;末尾</p>';
	assert.equal(stripHtml(html), '本文 & 強調 続き…A 末尾');
	assert.equal(stripHtml('<PRE>\n多行\nコード\n</PRE>残る'), '残る');
});

test('decodeEntities leaves unknown entities untouched', () => {
	assert.equal(decodeEntities('&lt;a&gt; &unknown; &#99999999;'), '<a> &unknown; &#99999999;');
});

test('normalise drops boilerplate phrases and lowercases', () => {
	assert.equal(normalise('Python 関連記事 スポンサーリンク WebAssembly'), 'python     webassembly');
});

test('tokenize produces space-padded character 2/3-grams per word like char_wb', () => {
	assert.deepEqual(tokenize('ab'), [' a', 'ab', 'b ', ' ab', 'ab ']);
	// A word shorter than n contributes the padded word exactly once.
	assert.deepEqual(tokenize('a'), [' a', 'a ', ' a ']);
	assert.deepEqual(tokenize('  非同期  処理 '), [
		' 非', '非同', '同期', '期 ', ' 非同', '非同期', '同期 ',
		' 処', '処理', '理 ', ' 処理', '処理 ',
	]);
	assert.deepEqual(tokenize('xyz', { minN: 2, maxN: 2 }), [' x', 'xy', 'yz', 'z ']);
	assert.deepEqual(tokenize('😀a', { minN: 2, maxN: 2 }), [' 😀', '😀a', 'a ']);
});

test('termFrequencies counts raw occurrences', () => {
	assert.deepEqual([...termFrequencies(['a', 'b', 'a'])], [['a', 2], ['b', 1]]);
});

test('inverseDocumentFrequencies applies smooth idf with min_df and max_df cut-offs', () => {
	const tfs = [
		termFrequencies(['common', 'pair', 'rare']),
		termFrequencies(['common', 'pair']),
		termFrequencies(['common']),
		termFrequencies(['common']),
	];
	const idf = inverseDocumentFrequencies(tfs, { minDf: 2, maxDf: 0.5 });
	assert.deepEqual([...idf.keys()], ['pair']); // rare: df=1 < 2, common: df=4 > 0.5*4
	close(idf.get('pair'), Math.log(5 / 3) + 1, 'smooth idf');
	assert.deepEqual([...inverseDocumentFrequencies(tfs, { minDf: 1, maxDf: 4 }).keys()].sort(), ['common', 'pair', 'rare']);
	assert.deepEqual([...inverseDocumentFrequencies(tfs, { minDf: 1, maxDf: 1.0 }).keys()].sort(), ['common', 'pair', 'rare']);
	assert.deepEqual([...inverseDocumentFrequencies(tfs, { minDf: 1, maxDf: 0.25 }).keys()], ['rare']);
});

test('tfidfVector uses sublinear tf, skips terms without idf, and is L2 normalised', () => {
	const idf = new Map([['a', 2], ['b', 1]]);
	const vector = tfidfVector(termFrequencies(['a', 'a', 'a', 'b', 'zzz']), idf);
	const wa = (1 + Math.log(3)) * 2;
	const wb = 1;
	const norm = Math.hypot(wa, wb);
	assert.equal(vector.has('zzz'), false);
	close(vector.get('a'), wa / norm, 'a');
	close(vector.get('b'), wb / norm, 'b');
	close([...vector.values()].reduce((s, v) => s + v * v, 0), 1, 'unit length');
	assert.equal(tfidfVector(termFrequencies(['zzz']), idf).size, 0);
});

test('cosineSimilarity is the dot product of sparse vectors regardless of argument order', () => {
	const a = new Map([['x', 0.6], ['y', 0.8]]);
	const b = new Map([['y', 1]]);
	const c = new Map([['z', 1], ['w', 1], ['v', 1]]);
	close(cosineSimilarity(a, b), 0.8);
	close(cosineSimilarity(b, a), 0.8);
	close(cosineSimilarity(a, a), 1);
	assert.equal(cosineSimilarity(a, c), 0);
});

test('buildTfidf ranks documents sharing n-grams above unrelated ones', () => {
	const { vectors, vocabularySize } = buildTfidf([
		'pythonで非同期処理を実装する',
		'c++で非同期処理を実装する',
		'フィルムカメラで撮影した写真',
		'水族館で撮影した写真',
	], { minDf: 2, maxDf: 0.5 });
	assert.ok(vocabularySize > 0);
	assert.ok(cosineSimilarity(vectors[0], vectors[1]) > cosineSimilarity(vectors[0], vectors[2]));
	assert.ok(cosineSimilarity(vectors[2], vectors[3]) > cosineSimilarity(vectors[2], vectors[1]));
});

test('toIsoDate converts parsable dates and blanks invalid ones', () => {
	assert.equal(toIsoDate('Tue, 15 Sep 2026 03:00:00 +0000'), '2026-09-15');
	assert.equal(toIsoDate('2026-09-15T00:00:00.000Z'), '2026-09-15');
	assert.equal(toIsoDate('invalid'), '');
});

const post = (n, title, content, date, categories = []) => ({
	title, url: `https://example.com/${n}`, date, categories, content,
});

test('buildRelatedIndex excludes itself, applies the score threshold, keeps top N, and sorts by date desc', () => {
	const posts = [
		post(1, 'Pythonで非同期処理を実装する', '<p>非同期処理 asyncio await</p>', '2026-01-01T00:00:00.000Z', ['Python']),
		post(2, 'C++で非同期処理を実装する', '<p>非同期処理 std::async future</p>', '2026-03-01T00:00:00.000Z', ['C++']),
		post(3, 'Kotlinで非同期処理を実装する', '<p>非同期処理 coroutine suspend</p>', '2026-02-01T00:00:00.000Z', ['Kotlin']),
		post(4, 'Goで非同期処理を実装する', '<p>非同期処理 goroutine channel</p>', '2025-12-01T00:00:00.000Z'),
		post(5, 'Rustで非同期処理を実装する', '<p>非同期処理 tokio async</p>', '2025-11-01T00:00:00.000Z'),
		post(6, 'Javaで非同期処理を実装する', '<p>非同期処理 CompletableFuture</p>', '2025-10-01T00:00:00.000Z'),
		post(7, 'Swiftで非同期処理を実装する', '<p>非同期処理 async let Task</p>', '2025-09-01T00:00:00.000Z'),
		post(8, 'フィルムカメラで撮影した写真の現像', '<p>現像 スキャン ネガフィルム</p>', '2025-08-01T00:00:00.000Z', ['カメラ']),
		post(9, 'アボカドの育て方', '<p>植物 水やり 日当たり</p>', '2025-07-01T00:00:00.000Z'),
	];
	const { index, vocabularySize } = buildRelatedIndex(posts, { minDf: 2, maxDf: 1.0, topN: 5, minScore: 0.08 });

	assert.ok(vocabularySize > 0);
	assert.deepEqual(index.map((e) => e.date), [
		'2026-03-01', '2026-02-01', '2026-01-01', '2025-12-01', '2025-11-01', '2025-10-01', '2025-09-01', '2025-08-01', '2025-07-01',
	]);
	assert.deepEqual(index[0].categories, ['C++']);
	assert.deepEqual(index.at(-1).categories, []);

	for (const entry of index) {
		assert.ok(entry.related.length <= 5, 'top N');
		assert.ok(entry.related.every((r) => r.url !== entry.url), 'self excluded');
		assert.ok(entry.related.every((r) => r.score >= 0.08), 'threshold');
		const scores = entry.related.map((r) => r.score);
		assert.deepEqual(scores, [...scores].sort((a, b) => b - a), 'sorted by score');
		for (const r of entry.related) assert.equal(r.score, Math.round(r.score * 10000) / 10000, 'rounded');
	}
	const python = index.find((e) => e.title.startsWith('Python'));
	assert.equal(python.related.length, 5); // seven similar posts, capped to five
	assert.ok(python.related.every((r) => r.title.includes('非同期処理')));
	assert.deepEqual(index.find((e) => e.title.startsWith('アボカド')).related, []);
});

test('buildRelatedIndex applies the threshold and tolerates posts without content or categories', () => {
	const posts = [
		{ title: 'C#でCSVファイルからDiffを取る', url: 'https://example.com/a', date: '2026-01-02T00:00:00.000Z' },
		{ title: 'PowerShellでCSVファイルからDiffを取る', url: 'https://example.com/b', date: '2026-01-01T00:00:00.000Z' },
		{ title: '全く関係のない記事', url: 'https://example.com/c', date: '2026-01-03T00:00:00.000Z' },
	];
	const { index } = buildRelatedIndex(posts, { minDf: 1, maxDf: 1.0, minScore: 0.5 });
	assert.equal(index[0].url, 'https://example.com/c');
	assert.deepEqual(index[0].categories, []);
	assert.equal(index[1].related.length, 1);
	assert.equal(index[1].related[0].url, 'https://example.com/b');
	assert.deepEqual(buildRelatedIndex(posts, { minDf: 1, maxDf: 1.0, minScore: 0.99 }).index.map((e) => e.related.length), [0, 0, 0]);
});
