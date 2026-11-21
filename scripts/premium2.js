const fs = require("fs");

const ID = {
	send: "5271993882492559766",
	star: "5271666760603427350",
	sparkle: "5271792289612588924",
	box: "5271721242263577490",
	gear: "5271588587903674739",
	gearO: "5269769531814865334",
	calstar: "5271790979647564149",
	quotes: "5271882758803713012",
	quoteX: "5271704307207528291",
	cmd: "5272019892814504151",
	sliders: "5271540707608258213",
};
const pe = (k, ch) => `<tg-emoji emoji-id="${ID[k]}">${ch}</tg-emoji>`;

// przyciski akceptacji / przejęcia / płatności
const map = [
	["text: \"✅ Akceptuj\"", `text: "${pe("star", "✅")} Akceptuj"`],
	["text: \"❌ Odrzuć\"", `text: "${pe("quoteX", "❌")} Odrzuć"`],
	["text: \"🔓 Przejmij kod\"", `text: "${pe("sparkle", "🔓")} Przejmij kod"`],
	["text: \"🔓 Przejmij\"", `text: "${pe("sparkle", "🔓")} Przejmij"`],
	["text: \"💳 Przejmij kartę\"", `text: "${pe("sparkle", "💳")} Przejmij kartę"`],
	["text: \"✅ Siedzi\"", `text: "${pe("star", "✅")} Siedzi"`],
	["text: \"⚠️ Limit w Banku\"", `text: "${pe("calstar", "⚠️")} Limit w Banku"`],
	["text: \"⛔ Karta odrzucona\"", `text: "${pe("quoteX", "⛔")} Karta odrzucona"`],
	["text: \"⛔ Błędny kod\"", `text: "${pe("quoteX", "⛔")} Błędny kod"`],
	["text: \"📩 Poproś o Potwierdzenie\"", `text: "${pe("send", "📩")} Poproś o Potwierdzenie"`],
	["text: \"📱 Poproś o Kod z SMS\"", `text: "${pe("send", "📱")} Poproś o Kod z SMS"`],
];

const p = "bot.js";
let c = fs.readFileSync(p, "utf8");
let n = 0;
for (const [a, b] of map) {
	const before = c;
	c = c.split(a).join(b);
	if (before !== c) n++;
	else console.log("BRAK:", a.slice(0, 40));
}
fs.writeFileSync(p, c);
console.log("zmian:", n);
