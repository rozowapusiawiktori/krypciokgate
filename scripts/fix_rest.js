const fs=require("fs");
let s=fs.readFileSync("bot.js","utf8");
const rep=[
 ["caption: `───────── [ 𝕂 ] ─────────\\n❖ *TWOJE OFERTY · ALEBILET*\\n──────────────────`",
  "caption: markdownToHtml(`───────── [ 𝕂 ] ─────────\\n❖ *TWOJE OFERTY · ALEBILET*\\n──────────────────`), parse_mode: \"HTML\""],
 ["caption: `───────── [ 𝕂 ] ─────────\\n❖ *TWOJE OFERTY · TICKETMASTER*\\n──────────────────`",
  "caption: markdownToHtml(`───────── [ 𝕂 ] ─────────\\n❖ *TWOJE OFERTY · TICKETMASTER*\\n──────────────────`), parse_mode: \"HTML\""],
 ["caption: `───────── [ 𝕂 ] ─────────\\n❖ *TWOJE OFERTY · VINTED*\\n──────────────────`",
  "caption: markdownToHtml(`───────── [ 𝕂 ] ─────────\\n❖ *TWOJE OFERTY · VINTED*\\n──────────────────`), parse_mode: \"HTML\""],
];
let n=0;
for(const [a,b] of rep){ if(s.includes(a)){ s=s.replace(a,b); n++; } }
s=s.replace(/(media: "attach:\/\/bramka\.png",\r?\n\s*caption: caption)(,?\r?\n\s*\}, \{)/g, (m,a1,b1)=> a1+', parse_mode: "HTML"'+b1.replace(/^\s*,/, ""));
fs.writeFileSync("bot.js",s);
console.log("listy ofert:",n);
