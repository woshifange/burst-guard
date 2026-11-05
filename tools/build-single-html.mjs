/**
 * 把 dist 打包成可直接双击打开的单文件 HTML（无需服务器）。
 * 产物：dist-single/burst-guard.html（AUTO）、burst-guard-canvas.html（强制 Canvas）。
 */
import fs from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const dist = path.join(root, 'dist');
const out = path.join(root, 'dist-single');
await fs.mkdir(out, { recursive: true });

const html = await fs.readFile(path.join(dist, 'index.html'), 'utf8');
const cssMatch = html.match(/<link rel="stylesheet"[^>]*href="([^"]+)"[^>]*>/);
const jsMatch = html.match(/<script type="module"[^>]*src="([^"]+)"[^>]*><\/script>/);
if (!cssMatch || !jsMatch) throw new Error('dist/index.html 结构不符（找不到 css/js 引用）');

const css = await fs.readFile(path.join(dist, cssMatch[1].replace(/^\.\//, '')), 'utf8');
let js = await fs.readFile(path.join(dist, jsMatch[1].replace(/^\.\//, '')), 'utf8');
js = js.replace(/<\/script/gi, '<\\/script');

// 注意：replace 的替换串会把 $& 当匹配子串，必须用函数形式原样插入
const base = html
  .replace(cssMatch[0], () => `<style>\n${css}\n</style>`)
  .replace(jsMatch[0], () => '<script type="module">\n' + js + '\n</script>');

await fs.writeFile(path.join(out, 'burst-guard.html'), base);
await fs.writeFile(
  path.join(out, 'burst-guard-canvas.html'),
  base.replace('<script type="module">', '<script>window.__BG_FORCE_CANVAS__=true;</script>\n<script type="module">'),
);
const size = (await fs.stat(path.join(out, 'burst-guard.html'))).size;
console.log(`single html ok: ${(size / 1024).toFixed(0)} KB → dist-single/`);
