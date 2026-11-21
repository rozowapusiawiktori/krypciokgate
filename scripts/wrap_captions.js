const fs = require('fs');
let s = fs.readFileSync('bot.js', 'utf8');
let n = 0;

// Podpisy przy sendPhoto (limit 1024) — owiń w fitCaption
s = s.replace(/caption: (markdownToHtml\(`[^`]*`\))/g, (m, expr) => { n++; return `caption: fitCaption(${expr})`; });
s = s.replace(/caption: (markdownToHtml\(formatVintedOfferCaption\([^)]*\)\))/g, (m, expr) => { n++; return `caption: fitCaption(${expr})`; });

fs.writeFileSync('bot.js', s);
console.log('wrapped:', n);
// ile captionów zostało bez zabezpieczenia
console.log('raw caption vars at sendPhoto:', (s.match(/caption,[\s\S]{0,40}?parse_mode/g) || []).length);
