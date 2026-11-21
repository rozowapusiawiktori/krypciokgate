const fs = require('fs');
const file = 'bot.js';
let src = fs.readFileSync(file, 'utf8');
let moved = 0;
let removed = 0;

// 1) Przenieś parse_mode z obiektu media do obiektu opcji (2. argument).
//    Wzorzec: bot.editMessageMedia({ ...media... }, { ...opts... })
const callRe = /(bot\.editMessageMedia\(\{)([\s\S]*?)(\n?[\t ]*\}, \{)([\s\S]*?)(\n?[\t ]*\}\s*\))/g;
src = src.replace(callRe, (m, head, media, mid, opts, tail) => {
	let mode = null;
	const media2 = media.replace(/\n?[\t ]*parse_mode: "(HTML|Markdown)",?/g, (mm, val) => {
		mode = val;
		return '';
	});
	if (!mode) return m;
	moved++;
	if (/parse_mode:/.test(opts)) return head + media2 + mid + opts + tail;
	return head + media2 + mid + `\n\t\t\t\tparse_mode: "${mode}",` + opts + tail;
});

// 2) Fallbacki editMessageCaption/sendPhoto z Markdown -> HTML (treść jest w HTML)
src = src.replace(/(\.editMessageCaption\([\s\S]{0,400}?parse_mode: )"Markdown"/g, (m, p) => {
	removed++;
	return p + '"HTML"';
});

fs.writeFileSync(file, src);
console.log('moved:', moved, 'markdown->html:', removed);
