// Podgląd: buduje wiadomości tak jak bot i wypisuje wynik HTML
const fs = require('fs');
const src = fs.readFileSync('bot.js', 'utf8');

function extract(name) {
	const start = src.indexOf(`function ${name}(`);
	if (start < 0) throw new Error('brak ' + name);
	let depth = 0, i = src.indexOf('{', start);
	const bodyStart = i;
	for (; i < src.length; i++) {
		if (src[i] === '{') depth++;
		else if (src[i] === '}') { depth--; if (depth === 0) break; }
	}
	return src.slice(start, i + 1);
}

const code = [
	extract('markdownToHtml'),
	extract('modernHeader'),
	extract('modernKv'),
	extract('modernBullet'),
	extract('modernInfo'),
	extract('buildModernPrompt'),
	extract('buildModernStatus'),
].join('\n\n');

eval(code);

const out = buildModernStatus([
	{ title: 'Wypłata', lines: [modernKv('Dostępne', '1000.00 PLN')] },
	{ title: 'Adres LTC zapisany', lines: [modernKv('Adres', 'ltc1qtest')] },
]);
console.log('--- STATUS (markdown -> html) ---');
console.log(markdownToHtml(out));
console.log('\n--- PROMPT ---');
console.log(markdownToHtml(buildModernPrompt('Kod BLIK', 'Wpisz 6-cyfrowy kod.')));
