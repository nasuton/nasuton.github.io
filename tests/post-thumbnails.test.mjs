import assert from 'node:assert/strict';
import test from 'node:test';
import { extractOpenGraphImage, fetchPostThumbnail } from '../src/lib/post-thumbnails.mjs';

test('reads og:image with reordered attributes, HTML entities, and relative URLs', () => {
	assert.equal(extractOpenGraphImage(`<head><META content='/images/photo.jpg?a=1&#038;b=2&amp;c=3' PROPERTY='og:image'></head>`, 'https://example.com/posts/1'), 'https://example.com/images/photo.jpg?a=1&b=2&c=3');
	assert.equal(extractOpenGraphImage('<meta property="og:image" content="https://example.com/photo.jpg">', 'https://example.com/'), 'https://example.com/photo.jpg');
});

test('ignores body images, scripts, comments, empty metadata, and non-HTTP image URLs', () => {
	const html = `<head><!-- <meta property="og:image" content="https://example.com/comment.jpg"> -->
	<script>const example = '<meta property="og:image" content="https://example.com/script.jpg">';</script>
	<meta property="og:image" content=""><meta property="og:image" content="data:image/png;base64,abc">
	</head><body><img src="https://example.com/related.jpg"><meta property="og:image" content="https://example.com/body.jpg"></body>`;
	assert.equal(extractOpenGraphImage(html, 'https://example.com/'), null);
});

test('stops after the head and cancels the article stream without waiting for its body', { timeout: 1000 }, async () => {
	let cancelled = false;
	const stream = new ReadableStream({
		start(controller) {
			controller.enqueue(new TextEncoder().encode('<head><meta property="og:image" content="/photo.jpg"></he'));
			controller.enqueue(new TextEncoder().encode('ad>'));
		},
		cancel() { cancelled = true; },
	});
	const image = await fetchPostThumbnail('https://example.com/post', {
		fetchImpl: async (url, options) => {
			assert.equal(url, 'https://example.com/post');
			assert.ok(options.signal instanceof AbortSignal);
			return new Response(stream, { headers: { 'Content-Type': 'text/html; charset=UTF-8' } });
		},
	});
	assert.equal(image, 'https://example.com/photo.jpg');
	assert.equal(cancelled, true);
});

test('rejects non-HTML responses and propagates timeouts during article body reads', async () => {
	await assert.rejects(fetchPostThumbnail('https://example.com/', {
		fetchImpl: async () => new Response('{}', { headers: { 'Content-Type': 'application/json' } }),
	}), /Unexpected Content-Type/);
	await assert.rejects(fetchPostThumbnail('https://example.com/', {
		fetchImpl: async () => new Response(new ReadableStream({
			start(controller) { controller.error(new DOMException('Article timed out', 'TimeoutError')); },
		}), { headers: { 'Content-Type': 'text/html' } }),
	}), /Article timed out/);
});
