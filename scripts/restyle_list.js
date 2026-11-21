const fs = require('fs');
let s = fs.readFileSync('bot.js', 'utf8');
for (const p of ['AleBilet', 'Ticketmaster', 'Vinted']) {
	const old = 'caption: "\u{1F4C3} ' + p + '"';
	const neu = 'caption: `\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 [ \u{1D542} ] \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\\n\u2756 *TWOJE OFERTY \u00b7 ' + p.toUpperCase() + '*\\n\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500`';
	const n = s.split(old).length - 1;
	s = s.split(old).join(neu);
	console.log(p, n);
}
fs.writeFileSync('bot.js', s);
