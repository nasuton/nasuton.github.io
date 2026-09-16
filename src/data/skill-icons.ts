import * as simpleIcons from 'simple-icons';

export interface SkillIcon {
	hex: string;
	path: string;
}

type SimpleIconsModule = Record<string, SkillIcon | undefined>;

const icons = simpleIcons as unknown as SimpleIconsModule;

/** スキル名(小文字) → simple-icons のエクスポート名 */
const skillMap: Readonly<Record<string, string>> = {
	'javascript': 'siJavascript',
	'typescript': 'siTypescript',
	'python': 'siPython',
	'react': 'siReact',
	'vue': 'siVuedotjs',
	'vue.js': 'siVuedotjs',
	'astro': 'siAstro',
	'node.js': 'siNodedotjs',
	'nodejs': 'siNodedotjs',
	'html': 'siHtml5',
	'html5': 'siHtml5',
	'css': 'siCss',
	'css3': 'siCss',
	'git': 'siGit',
	'github': 'siGithub',
	'github pages': 'siGithubpages',
	'docker': 'siDocker',
	'rust': 'siRust',
	'go': 'siGo',
	'webassembly': 'siWebassembly',
	'java': 'siOpenjdk',
	'c++': 'siCplusplus',
	'php': 'siPhp',
	'ruby': 'siRuby',
	'swift': 'siSwift',
	'kotlin': 'siKotlin',
	'next.js': 'siNextdotjs',
	'nextjs': 'siNextdotjs',
	'nuxt': 'siNuxt',
	'nuxt.js': 'siNuxt',
	'svelte': 'siSvelte',
	'tailwind': 'siTailwindcss',
	'tailwindcss': 'siTailwindcss',
	'mysql': 'siMysql',
	'postgresql': 'siPostgresql',
	'postgres': 'siPostgresql',
	'mongodb': 'siMongodb',
	'redis': 'siRedis',
	'linux': 'siLinux',
	'figma': 'siFigma',
	'vite': 'siVite',
	'vitest': 'siVitest',
	'jest': 'siJest',
	'eslint': 'siEslint',
	'prettier': 'siPrettier',
	'angular': 'siAngular',
	'flutter': 'siFlutter',
	'dart': 'siDart',
	'firebase': 'siFirebase',
	'supabase': 'siSupabase',
	'vercel': 'siVercel',
	'netlify': 'siNetlify',
	'cloudflare': 'siCloudflare',
	'graphql': 'siGraphql',
	'prisma': 'siPrisma',
	'sass': 'siSass',
	'scss': 'siSass',
	'bash': 'siGnubash',
	'ansible': 'siAnsible',
	'kubernetes': 'siKubernetes',
	'terraform': 'siTerraform',
	'unity': 'siUnity',
	'unreal': 'siUnrealengine',
	'wordpress': 'siWordpress',
	'gin': 'siGin',
	'apache': 'siApache',
};

/** simple-icons に収録されていないスキル用のカスタムアイコン */
const MICROSOFT_LOGO_PATH =
	'M0 0h11.5v11.5H0V0zm12.5 0H24v11.5H12.5V0zM0 12.5h11.5V24H0V12.5zm12.5 0H24V24H12.5V12.5z';

const customIconMap: Readonly<Record<string, SkillIcon>> = {
	'c#': {
		hex: '239120',
		// MDI language-csharp アイコン
		path: 'M11.5 15.97l.41 2.44c-.26.14-.68.27-1.24.38-.57.13-1.24.2-2.01.2-2.21-.04-3.87-.7-4.98-1.96C2.57 15.77 2 14.16 2 12.21c.05-2.31.72-4.08 2.01-5.29C5.29 5.71 6.85 5.1 8.7 5.1c.75 0 1.4.07 1.94.18s.94.25 1.2.4l-.58 2.49-1.06-.34c-.4-.1-.86-.15-1.39-.15-1.16-.01-2.1.35-2.8 1.09-.71.74-1.08 1.84-1.1 3.31 0 1.36.36 2.42 1.09 3.17.92.78 1.85 1.15 2.79 1.11.53 0 1-.06 1.39-.18l1.22-.21M13.89 19l.61-4H13l.34-2h1.5l.32-2h-1.5L14 9h1.5l.61-4h2l-.61 4h1l.61-4h2l-.61 4H22l-.34 2h-1.5l-.32 2h1.5L21 15h-1.5l-.61 4h-2l.61-4h-1l-.61 4h-2m2.95-6h1l.32-2h-1l-.32 2z',
	},
	// Windows 4分割フラグ（Microsoft ブランドカラー）
	'sql server': { hex: '0078D4', path: MICROSOFT_LOGO_PATH },
	'sqlserver': { hex: '0078D4', path: MICROSOFT_LOGO_PATH },
	'mssql': { hex: '0078D4', path: MICROSOFT_LOGO_PATH },
	'powershell': {
		hex: '0078D4',
		// ターミナル風アイコン（>_ 形状）
		path: 'M2 5.27L3.27 4 9 9.73 3.27 15.46 2 14.19 6.46 9.73 2 5.27zM10 14h10v2H10v-2z',
	},
};

/** アイコンが見つからない場合のフォールバックカラー */
export const FALLBACK_COLOR = '#6366f1';

/**
 * スキル名からアイコン情報を取得する。
 * 大文字小文字・前後の空白は無視される。見つからない場合は null。
 */
export function getSkillIcon(name: string): SkillIcon | null {
	const key = name.trim().toLowerCase();
	const exportName = skillMap[key];

	if (exportName) {
		const icon = icons[exportName];
		if (icon) return { hex: icon.hex, path: icon.path };
		// マッピングは存在するが simple-icons 側で改名・削除された場合の保険
		if (import.meta.env.DEV) {
			console.warn(`[SkillBadge] simple-icons に "${exportName}" が見つかりません (skill: ${name})`);
		}
	}

	return customIconMap[key] ?? null;
}

