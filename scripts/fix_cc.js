const fs=require("fs");
let s=fs.readFileSync("bot.js","utf8");
s=s.replace(/caption,,\s*parse_mode:/g, (m)=>"caption, parse_mode:");
fs.writeFileSync("bot.js",s);
