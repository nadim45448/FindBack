// Link audit utility for the FindBack prototype.
// Walks every HTML file in mockups/, finds href/data-next/string-literal
// references to .html files, and verifies each target exists on disk.
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, 'mockups');
const FILE_RE = /\.html$/;

function walk(dir, files = []) {
  fs.readdirSync(dir).forEach(name => {
    const p = path.join(dir, name);
    if (fs.statSync(p).isDirectory()) walk(p, files);
    else if (FILE_RE.test(p)) files.push(p);
  });
  return files;
}

const htmlFiles = walk(ROOT);
let issues = 0;

htmlFiles.forEach(file => {
  const content = fs.readFileSync(file, 'utf8');
  // 1. href and data-next attributes.
  const re = /(?:href|data-next)=("([^"]*)")/g;
  let m;
  while ((m = re.exec(content)) !== null) {
    const target = m[2];
    if (/^https?:\/\//.test(target)) continue;
    if (/^mailto:/.test(target)) continue;
    if (/^\s*javascript:/.test(target)) continue;
    if (target === '#' || target === '#main' || target.startsWith('#')) continue;
    const base = target.split('?')[0];
    if (/['\"+%]/.test(base)) continue;
    const from = path.dirname(file);
    const resolved = path.normalize(path.join(from, base));
    if (resolved.startsWith('..')) continue;
    if (!fs.existsSync(resolved)) {
      console.log('MISSING href: ' + path.relative(ROOT, file) + ' -> ' + target + ' (resolved: ' + resolved + ')');
      issues++;
    }
  }
  // 2. JS-side string literals ending in .html (skip matches inside `<a>...</a>` link text).
  const htmlRefRe = /["']([^"'\s]*?\.html)/g;
  while ((m = htmlRefRe.exec(content)) !== null) {
    const base = m[1];
    if (/^https?:/.test(base)) continue;
    if (/javascript:/.test(base)) continue;
    // Check whether this match is inside anchor text (<a ...>...</a>) by looking
    // for a preceding ">" with no closing "</a>" between it and the match.
    const start = m.index;
    const snippet = content.slice(Math.max(0, start - 200), start);
    if (snippet.lastIndexOf('<a') > snippet.lastIndexOf('</a>')) continue;
    const cleanBase = base.split('?')[0];
    const from = path.dirname(file);
    const resolved = path.normalize(path.join(from, cleanBase));
    if (resolved.startsWith('..')) continue;
    if (!fs.existsSync(resolved)) {
      console.log('MISSING in script: ' + path.relative(ROOT, file) + ' -> ' + base + ' (resolved: ' + resolved + ')');
      issues++;
    }
  }
});

console.log('\nTotal link issues: ' + issues);
process.exit(issues > 0 ? 1 : 0);
