const fs=require("fs");
let s=fs.readFileSync("bot.js","utf8");
// 1) helper
if(!s.includes("function mdToHtml")){
  s=s.replace("function pe(key, fallback) {", `function mdToHtml(t) {\n\treturn String(t)\n\t\t.replace(/\\*\\*([^*]+)\\*\\*/g, "<b>$1</b>")\n\t\t.replace(/\\*([^*\\n]+)\\*/g, "<b>$1</b>")\n\t\t.replace(/\`([^\`\\n]+)\`/g, "<code>$1</code>");\n}\n\nfunction pe(key, fallback) {`);
}
// 2) zamien wszystkie parse_mode Markdown -> HTML i opakuj w mdToHtml
let n=0;
s=s.replace(/parse_mode:\s*"Markdown"/g, ()=>{n++;return 'parse_mode: "HTML"';});
fs.writeFileSync("bot.js",s);
console.log("parse_mode:",n);
