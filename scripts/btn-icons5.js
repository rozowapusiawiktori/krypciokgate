const fs = require("fs");
const p = "bot.js";
const lines = fs.readFileSync(p, "utf8").split("\n");
let n = 0;
const out = lines.map((line) => {
	if (!/text:\s*`[^`]*<tg-emoji/.test(line)) return line;
	let l = line;
	const tag = /<tg-emoji emoji-id=\\?"(\d+)\\?">([^<]*)<\/tg-emoji>\uFE0F?\s*/;
	const m = tag.exec(l);
	if (!m) return l;
	const id = m[1];
	l = l.replace(m[0], "");
	l = l.replace(/`\s*,\s*callback_data/, `\`, icon_custom_emoji_id: "${id}", callback_data`);
	n++;
	return l;
});
fs.writeFileSync(p, out.join("\n"));
console.log("poprawione:", n);
