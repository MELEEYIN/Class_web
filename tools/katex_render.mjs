// tools/katex_render.mjs — 构建期把 LaTeX 批量渲染成 HTML（供 build_en_math750.py 调用）
//
// 为什么在构建期渲染：站点的 CSP 是 script-src 'self'，不能引 CDN；运行时再渲染会先闪一段
// 原始 $...$。这里一次性转换成静态 HTML，页面零 JS、零字体闪烁。
// 字体：site/vendor/katex/fonts/*.woff2（构建产物里已带）。
//
// 用法：node tools/katex_render.mjs in.json out.json
//   in.json  = {"formulas": [["\\dfrac{a}{b}", false], ...]}   // [latex, 是否行间公式]
//   out.json = {"html": ["<span class=katex>…", ...]}

import fs from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const katex = require('katex');

const [, , inPath, outPath] = process.argv;
if (!inPath || !outPath) {
  console.error('usage: node tools/katex_render.mjs in.json out.json');
  process.exit(2);
}

const input = JSON.parse(fs.readFileSync(inPath, 'utf8'));
const formulas = input.formulas || [];
const html = formulas.map(([tex, display]) => {
  try {
    return katex.renderToString(String(tex), {
      displayMode: !!display,
      throwOnError: false,
      strict: 'ignore',
      trust: false,
      output: 'mathml'
    });
  } catch (e) {
    return '<code class="texbad">' + String(tex).replace(/[<>&]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c])) + '</code>';
  }
});

fs.writeFileSync(outPath, JSON.stringify({ html }), 'utf8');
console.log('rendered ' + html.length + ' formulas');
