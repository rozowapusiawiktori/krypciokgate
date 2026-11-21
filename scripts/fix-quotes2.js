const fs = require("fs");
const p = "bot.js";
const lines = fs.readFileSync(p, "utf8").split("\n");
let n = 0;
const out = lines.map((line) => {
	const m = /^(\s*\{?\s*text: ")(.*)(",(?: callback_data|$))/.exec(line);
	if (!m) return line;
	let body = line.slice(m[1].length, line.length - m[3].length);
	// usun stare escapowanie i zescapuj wszystkie cudzyslowy w tresci
	body = body.replace(/\\"/g, '"').replace(/"/g, '\\"');
	const l = m[1] + body + m[3];
	if (l !== line) n++;
	return l;
});
fs.writeFileSync(p, out.join("\n"));
console.log("poprawionych etykiet:", n);
