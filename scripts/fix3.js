const fs = require("fs");
const p = "bot.js";
const lines = fs.readFileSync(p, "utf8").split("\n");

const out = lines.map((line) => {
	const m = /^(\s*\{?\s*text: )(["'])([\s\S]*?)(\2, callback_data)/.exec(line);
	if (!m) return line;
	const quote = m[2];
	let body = m[3];
	// napraw zdublowane prefiksy i escapowanie
	body = body.replace(/\\"/g, '"');
	body = body.replace(/^emoji-id="\d+">/, "");
	body = body.split("</tg-emoji></tg-emoji>").join("</tg-emoji>");
	if (quote === '"') body = body.replace(/"/g, '\\"');
	return m[1] + quote + body + (quote === '"' ? '", callback_data' : "', callback_data");
});

fs.writeFileSync(p, out.join("\n"));
console.log("ok");
