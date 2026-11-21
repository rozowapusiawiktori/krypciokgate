const fs = require("fs");
const p = "bot.js";
const lines = fs.readFileSync(p, "utf8").split("\n");

// funkcje "bramkowe" -> podmiana banita.png na bramka.png
const targets = [
	"refreshOfferMenuVintedGlobal", "refreshOfferMenu", "refreshOfferMenuOLX", "refreshOfferMenuVinted",
	"showUserOffers", "formatImageNames", "handlePlatformOfferCallbacks", "tagParts", "raw", "reloadPrzelewPanel",
	"addOfferVinted",
];

let cur = "";
let changed = 0;
for (let i = 0; i < lines.length; i++) {
	const fn = /(?:async )?function (\w+)|const (\w+) = (?:async )?\(/.exec(lines[i]);
	if (fn) cur = fn[1] || fn[2];
	if (!targets.includes(cur)) continue;
	if (!/banita\.png/.test(lines[i])) continue;
	lines[i] = lines[i].replace(/banita\.png/g, "bramka.png");
	changed++;
}
fs.writeFileSync(p, lines.join("\n"));
console.log("podmienione linie:", changed);
