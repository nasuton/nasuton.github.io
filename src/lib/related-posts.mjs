// TF-IDF + cosine similarity over character n-grams.
// Japanese has no spaces between words, so instead of a morphological analyser (which needs a
// dictionary at build time) we use character 2/3-grams. They need no dictionary and handle product
// names and new coinages such as "WebAssembly" or "Gin" that a dictionary would miss.

export const DEFAULTS = Object.freeze({
	minN: 2,
	maxN: 3,
	minDf: 2,
	maxDf: 0.5,
	topN: 5,
	minScore: 0.08, // below this the pair shares only common Japanese fragments
});

// Boilerplate that appears in nearly every post and only adds noise.
const NOISE_RE = /関連記事|スポンサーリンク|広告|目次|この記事を書いた人|シェアする/g;
// Code blocks are mostly language boilerplate that would distort similarity.
const CODE_RE = /<(pre|code|script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi;
const TAG_RE = /<[^>]+>/g;
const NAMED_ENTITIES = {
	amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', hellip: '…', mdash: '—', ndash: '–',
	lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”', copy: '©', reg: '®', trade: '™', times: '×', laquo: '«', raquo: '»',
};

export function decodeEntities(text) {
	return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, entity) => {
		if (entity[0] === '#') {
			const code = entity[1].toLowerCase() === 'x' ? parseInt(entity.slice(2), 16) : parseInt(entity.slice(1), 10);
			return Number.isFinite(code) && code >= 0 && code <= 0x10ffff ? String.fromCodePoint(code) : match;
		}
		return NAMED_ENTITIES[entity.toLowerCase()] ?? match;
	});
}

export function stripHtml(html) {
	const text = String(html).replace(CODE_RE, ' ').replace(TAG_RE, ' ');
	return decodeEntities(text).replace(/\s+/g, ' ').trim();
}

export function normalise(text) {
	return String(text).replace(NOISE_RE, ' ').toLowerCase();
}

// Equivalent to scikit-learn's analyzer="char_wb": n-grams are taken inside space-padded words,
// so a word shorter than n contributes the padded word itself exactly once.
export function tokenize(text, { minN = DEFAULTS.minN, maxN = DEFAULTS.maxN } = {}) {
	const grams = [];
	for (const word of String(text).split(/\s+/)) {
		if (!word) continue;
		const chars = Array.from(` ${word} `);
		for (let n = minN; n <= maxN; n++) {
			let offset = 0;
			grams.push(chars.slice(offset, offset + n).join(''));
			while (offset + n < chars.length) {
				offset++;
				grams.push(chars.slice(offset, offset + n).join(''));
			}
			if (offset === 0) break;
		}
	}
	return grams;
}

export function termFrequencies(tokens) {
	const tf = new Map();
	for (const token of tokens) tf.set(token, (tf.get(token) ?? 0) + 1);
	return tf;
}

// Smooth IDF as in scikit-learn: log((1 + N) / (1 + df)) + 1, restricted to min_df <= df <= max_df.
// `minDf` is an absolute document count; `maxDf` is a proportion when <= 1, otherwise an absolute count.
export function inverseDocumentFrequencies(documentTfs, { minDf = DEFAULTS.minDf, maxDf = DEFAULTS.maxDf } = {}) {
	const n = documentTfs.length;
	const dfs = new Map();
	for (const tf of documentTfs) {
		for (const term of tf.keys()) dfs.set(term, (dfs.get(term) ?? 0) + 1);
	}
	const maxDocs = maxDf <= 1 ? maxDf * n : maxDf;
	const idf = new Map();
	for (const [term, df] of dfs) {
		if (df < minDf || df > maxDocs) continue;
		idf.set(term, Math.log((1 + n) / (1 + df)) + 1);
	}
	return idf;
}

// Sublinear TF (1 + log(tf)) × IDF, L2-normalised so that cosine similarity is a plain dot product.
export function tfidfVector(tf, idf) {
	const vector = new Map();
	let norm = 0;
	for (const [term, count] of tf) {
		const weight = idf.get(term);
		if (weight === undefined) continue;
		const value = (1 + Math.log(count)) * weight;
		vector.set(term, value);
		norm += value * value;
	}
	if (norm > 0) {
		norm = Math.sqrt(norm);
		for (const [term, value] of vector) vector.set(term, value / norm);
	}
	return vector;
}

export function cosineSimilarity(a, b) {
	const [small, large] = a.size <= b.size ? [a, b] : [b, a];
	let dot = 0;
	for (const [term, value] of small) {
		const other = large.get(term);
		if (other !== undefined) dot += value * other;
	}
	return dot;
}

export function buildTfidf(docs, options = {}) {
	const tfs = docs.map((doc) => termFrequencies(tokenize(doc, options)));
	const idf = inverseDocumentFrequencies(tfs, options);
	return { vectors: tfs.map((tf) => tfidfVector(tf, idf)), vocabularySize: idf.size };
}

export function toIsoDate(date) {
	const parsed = new Date(date);
	return Number.isNaN(parsed.getTime()) ? '' : parsed.toISOString().slice(0, 10);
}

/**
 * Build the related-posts index.
 * @param {{ title: string, url: string, date: string, categories?: string[], content?: string }[]} posts
 * @returns {{ index: { url: string, title: string, date: string, categories: string[], related: { url: string, title: string, score: number }[] }[], vocabularySize: number }}
 */
export function buildRelatedIndex(posts, options = {}) {
	const { topN = DEFAULTS.topN, minScore = DEFAULTS.minScore } = options;
	// The title carries strong signal, so weight it by repeating it.
	const docs = posts.map((post) => normalise(`${post.title} ${post.title} ${stripHtml(post.content ?? '')}`));
	const { vectors, vocabularySize } = buildTfidf(docs, options);

	const scores = posts.map(() => new Float64Array(posts.length));
	for (let i = 0; i < posts.length; i++) {
		for (let j = i + 1; j < posts.length; j++) {
			const score = cosineSimilarity(vectors[i], vectors[j]);
			scores[i][j] = score;
			scores[j][i] = score;
		}
	}

	const index = posts.map((post, i) => {
		const ranked = [];
		for (let j = 0; j < posts.length; j++) {
			if (j !== i && scores[i][j] >= minScore) ranked.push(j);
		}
		ranked.sort((a, b) => scores[i][b] - scores[i][a]);
		return {
			url: post.url,
			title: post.title,
			date: toIsoDate(post.date),
			categories: post.categories ?? [],
			related: ranked.slice(0, topN).map((j) => ({
				url: posts[j].url,
				title: posts[j].title,
				score: Math.round(scores[i][j] * 10000) / 10000,
			})),
		};
	});
	index.sort((a, b) => b.date.localeCompare(a.date));
	return { index, vocabularySize };
}
