const fs = require("fs");
const p = "bot.js";
const lines = fs.readFileSync(p, "utf8").split("\n");
let n = 0;

const out = lines.map((line, i) => {
	// toast = linia tekstu wewnatrz answerCallbackQuery: kontekst 3 linii w gore
	if (!/text: /.test(line) || !/tg-emoji/.test(line)) return line;
	const ctx = lines.slice(Math.max(0, i - 4), i + 1).join("\n");
	if (!/answerCallbackQuery/.test(ctx)) return line;
	const cleaned = line.replace(/<tg-emoji emoji-id=\\?"\d+\\?">([^<]*)<\/tg-emoji>/g, "$1");
	if (cleaned !== line) n++;
	return cleaned;
});

fs.writeFileSync(p, out.join("\n"));
console.log("oczyszczone toasty:", n);
