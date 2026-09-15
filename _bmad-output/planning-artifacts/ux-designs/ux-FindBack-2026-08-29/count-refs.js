// Count HTML files + internal href/data-next references for the link-audit report.
const fs = require('fs');
const path = require('path');

const root = __dirname + '/mockups';
const FILE_RE = /\.html$/;

function walk(dir, files = []) {
  fs.readdirSync(dir).forEach(name => {
    const p = path.join(dir, name);
    if (fs.statSync(p).isDirectory()) walk(p, files);
    else if (FILE_RE.test(p)) files.push(p);
  });
  return files;
}

const files = walk(root);
const htmlFiles = files.length;

let refs = 0;
const hrefRe = /(?:href|data-next)=("([^"]*)")/g;
files.forEach(file => {
  const c = fs.readFileSync(file, 'utf8');
  let m;
  while ((m = hrefRe.exec(c)) !== null) {
    const t = m[2];
    if (/^https?:\/\//.test(t)) continue;
    if (/^mailto:/.test(t)) continue;
    if (/^javascript:/.test(t)) continue;
    if (t === '#' || t === '#main' || t.startsWith('#')) continue;
    if (/['\"+%]/.test(t)) continue;
    refs++;
  }
});

console.log('HTML files checked: ' + htmlFiles);
console.log('Internal references checked: ' + refs);
