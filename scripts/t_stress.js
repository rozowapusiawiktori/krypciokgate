const fs = require('fs');
const src = fs.readFileSync('/opt/krypciokgate/bot.js', 'utf8');

function extract(name) {
	const start = src.indexOf(`function ${name}(`);
	let depth = 0, i = src.indexOf('{', start);
	for (; i < src.length; i++) {
		if (src[i] === '{') depth++;
		else if (src[i] === '}') { depth--; if (depth === 0) break; }
	}
	return src.slice(start, i + 1);
}
eval(extract('markdownToHtml'));
eval(extract('fitCaption'));
eval(extract('formatVintedOfferCaption'));

// Ekstremalnie długie pola
const long = 'X'.repeat(400);
const offer = {
	idoferty: '1', nazwa: long, description: long, cena: '620',
	cenaDostawy: '11.49', cenaOchrony: '4.99', nazwaFirmy: long,
	sprzedawca: long, miasto: long, kategoria: long, tagi: long,
	zdjecia: ['a'], lastonline: long,
};
const html = fitCaption(markdownToHtml(formatVintedOfferCaption(offer, 'https://vinted.x.y/items/' + long)));
console.log('DLUGOSC:', html.length, '| domkniete tagi:', (html.match(/<[a-z]+>/g) || []).length === (html.match(/<\/[a-z]+>/g) || []).length);

const env = fs.readFileSync('/opt/krypciokgate/banita.env', 'utf8');
const token = /^TOKEN=(.+)$/m.exec(env)[1].trim();
(async () => {
	const r = await fetch(`https://api.telegram.org/bot${token}/sendPhoto`, {
		method: 'POST', headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ chat_id: 8806188013, photo: 'https://picsum.photos/id/1015/400/260', caption: html, parse_mode: 'HTML' }),
	});
	const j = await r.json();
	console.log('SEND:', j.ok, j.description || '');
})();
