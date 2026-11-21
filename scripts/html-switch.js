const fs = require("fs");
const p = "bot.js";
const lines = fs.readFileSync(p, "utf8").split("\n");

const targets = new Set();
const modeLines = new Set();

for (let i = 0; i < lines.length; i++) {
	if (!/<tg-emoji/.test(lines[i])) continue;
	for (let j = i; j < Math.min(i + 18, lines.length); j++) {
		const m = /parse_mode:\s*"(\w+)"/.exec(lines[j]);
		if (m) {
			if (m[1] === "Markdown" || m[1] === "MarkdownV2") {
				let start = i;
				while (start > 0 && !/(const caption|const text|const message)\s*=/.test(lines[start])) start--;
				for (let k = start; k <= i; k++) targets.add(k);
				modeLines.add(j);
			}
			break;
		}
	}
}

// Markdown -> HTML bez ruszania zewnetrznych backtickow szablonu
function toHtml(s) {
	return s
		.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '<a href="$2">$1</a>')
		.replace(/\\`([^\\`]+)\\`/g, "<code>$1</code>")
		.replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<b>$2</b>");
}

const out = lines.map((line, i) => {
	if (modeLines.has(i)) return line.replace(/parse_mode:\s*"(Markdown|MarkdownV2)"/, 'parse_mode: "HTML"');
	if (targets.has(i) && /<tg-emoji/.test(line)) return toHtml(line);
	return line;
});

fs.writeFileSync(p, out.join("\n"));
console.log("caption linii:", targets.size, "| parse_mode:", modeLines.size);
