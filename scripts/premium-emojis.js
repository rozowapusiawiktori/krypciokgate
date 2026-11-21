const fs = require("fs");

const ID = {
	send: "5271993882492559766",
	apple: "5269274438049752598",
	star: "5271666760603427350",
	sparkle: "5271792289612588924",
	calstar: "5271790979647564149",
	cmd: "5272019892814504151",
	box: "5271721242263577490",
	gearO: "5269769531814865334",
	gear: "5271588587903674739",
	gearA: "5271470051101272581",
	gearHD: "5271710728183637588",
	gearSD: "5271811883253391120",
	gearFHD: "5269500757056449381",
	sliders: "5271540707608258213",
	slidersV: "5271918596010828714",
	quotes: "5271882758803713012",
	quoteX: "5271704307207528291",
};

const pe = (key, ch) => `<tg-emoji emoji-id="${ID[key]}">${ch}</tg-emoji>`;

// emoji w etykietach przycisków -> premium odpowiednik
const map = [
	["⚙️", pe("gear", "⚙️")],
	["🛠️", pe("gearO", "🛠️")],
	["🛠 ", pe("gearO", "🛠") + " "],
	["⚙ ", pe("gear", "⚙") + " "],
	["🔧", pe("gearA", "🔧")],
	["🎛️", pe("sliders", "🎛️")],
	["🎛", pe("sliders", "🎛")],
	["📤", pe("send", "📤")],
	["📨", pe("send", "📨")],
	["📩", pe("send", "📩")],
	["📢", pe("send", "📢")],
	["📣", pe("send", "📣")],
	["🌟", pe("sparkle", "🌟")],
	["✨", pe("sparkle", "✨")],
	["⭐", pe("star", "⭐")],
	["🛍", pe("box", "🛍")],
	["🛍️", pe("box", "🛍️")],
	["📋", pe("box", "📋")],
	["🗂", pe("box", "🗂")],
	["📝", pe("quotes", "📝")],
	["📃", pe("quotes", "📃")],
	["📅", pe("calstar", "📅")],
	["🗓", pe("calstar", "🗓")],
	["⌘", pe("cmd", "⌘")],
	["❌", pe("quoteX", "❌")],
	["✖", pe("quoteX", "✖")],
];

const p = "bot.js";
const lines = fs.readFileSync(p, "utf8").split("\n");
let changed = 0;
const out = lines.map((line) => {
	if (!/text:\s*[`"]/.test(line)) return line;
	// pomijamy linie juz przetworzone
	if (line.includes("<tg-emoji")) return line;
	let l = line;
	for (const [from, to] of map) if (l.includes(from)) l = l.split(from).join(to);
	if (l !== line) changed++;
	return l;
});
fs.writeFileSync(p, out.join("\n"));
console.log("zmienione linie:", changed);
