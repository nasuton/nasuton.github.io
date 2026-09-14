/**
 * 画面表示テキストの多言語辞書。
 * Welcome.astro ではビルド時に日本語(ja)で描画し、
 * クライアント側で data-i18n 属性を持つ要素のテキストを差し替える。
 */
export type Lang = 'ja' | 'en';

export const DEFAULT_LANG: Lang = 'ja';
export const LANG_STORAGE_KEY = 'aboutme-lang';

export const translations = {
	ja: {
		'meta.title': 'ナストン | About Me',

		// ヘッダー
		'header.name': 'ナストン',
		'header.tagline': '熱しやすく冷めやすいプログラマー',
		'header.profileAlt': 'ナストンのプロフィール画像',
		'header.langSwitch': '言語切り替え',

		// タブ
		'tab.ariaLabel': '表示内容の切り替え',
		'tab.general': '一般',
		'tab.tech': '技術',

		// 目次
		'toc.title': '目次',
		'toc.generalAria': '一般タブの目次',
		'toc.techAria': '技術タブの目次',

		// セクション見出し
		'section.profile': 'プロフィール',
		'section.hobby': '趣味',
		'section.camera': '撮影機材',
		'section.links': '各リンク',
		'section.skills': '触ったことのあるもの',
		'section.portfolio': 'ポートフォリオ / 作品',

		// プロフィール
		'profile.line1': '気になったものはとりあえず触ってみる。現役プログラマー',
		'profile.line2': '最近は、フィルムカメラにお熱',

		// ポートフォリオ
		'portfolio.link': 'リンク',
		'portfolio.techs': '使用技術',
		'portfolio.latestPosts': '最新記事',
		'portfolio.blog.title': '技術ブログ(ナストンのまとめ)',
		'portfolio.blog.description': '気になった技術や日々の学びをまとめています',
		'portfolio.blog.openAria': '技術ブログ(ナストンのまとめ) を新しいタブで開く',
		'portfolio.password.title': 'パスワード生成ツール',
		'portfolio.password.description':
			'安全なパスワードを生成するためのシンプルなツール。フロントエンドをReact、バックエンドをGo言語ginフレームワークで構築しています。',
		'portfolio.password.openAria': 'パスワード生成ツール を新しいタブで開く',

		// 趣味
		'hobby.reading': '読書',
		'hobby.aquarium': '水族館巡り',
		'hobby.game': 'ゲーム',
		'hobby.shrine': '社寺巡り',
		'hobby.filmCamera': 'フィルムカメラ',

		// 撮影機材
		'camera.smartphone': 'スマホ',
		'camera.digital': 'デジカメ',
		'camera.film': 'フィルムカメラ',

		// リンク
		'links.photoGallery': 'ナストンの記録',
	},
	en: {
		'meta.title': 'Nasuton | About Me',

		// ヘッダー
		'header.name': 'Nasuton',
		'header.tagline': 'A programmer who gets hooked quickly and bored just as fast',
		'header.profileAlt': "Nasuton's profile picture",
		'header.langSwitch': 'Switch language',

		// タブ
		'tab.ariaLabel': 'Switch content',
		'tab.general': 'General',
		'tab.tech': 'Tech',

		// 目次
		'toc.title': 'Contents',
		'toc.generalAria': 'Table of contents (General tab)',
		'toc.techAria': 'Table of contents (Tech tab)',

		// セクション見出し
		'section.profile': 'Profile',
		'section.hobby': 'Hobbies',
		'section.camera': 'Camera Gear',
		'section.links': 'Links',
		'section.skills': 'Technologies I Have Used',
		'section.portfolio': 'Portfolio / Works',

		// プロフィール
		'profile.line1': 'I try out anything that catches my interest. Working programmer.',
		'profile.line2': 'Currently into film cameras.',

		// ポートフォリオ
		'portfolio.link': 'Open',
		'portfolio.techs': 'Technologies',
		'portfolio.latestPosts': 'Latest Posts',
		'portfolio.blog.title': 'Tech Blog (Nasuton no Matome)',
		'portfolio.blog.description': 'Notes on technologies that caught my interest and what I learn day to day',
		'portfolio.blog.openAria': 'Open Tech Blog (Nasuton no Matome) in a new tab',
		'portfolio.password.title': 'Password Generator',
		'portfolio.password.description':
			'A simple tool for generating secure passwords. The frontend is built with React and the backend with Go (Gin framework).',
		'portfolio.password.openAria': 'Open Password Generator in a new tab',

		// 趣味
		'hobby.reading': 'Reading',
		'hobby.aquarium': 'Visiting aquariums',
		'hobby.game': 'Video games',
		'hobby.shrine': 'Visiting shrines and temples',
		'hobby.filmCamera': 'Film photography',

		// 撮影機材
		'camera.smartphone': 'Smartphones',
		'camera.digital': 'Digital Cameras',
		'camera.film': 'Film Cameras',

		// リンク
		'links.photoGallery': "Nasuton's Photo Log",
	},
} as const satisfies Record<Lang, Record<string, string>>;

export type TranslationKey = keyof (typeof translations)['ja'];

/** 日付表示に使うロケール */
export const dateLocales: Record<Lang, string> = {
	ja: 'ja-JP',
	en: 'en-US',
};

export const isLang = (value: unknown): value is Lang => value === 'ja' || value === 'en';
