const fs=require("fs");
const L=fs.readFileSync("bot.js","utf8").split("\n");
const bad=[];
for(let i=0;i<L.length;i++){
  if(/parse_mode:\s*"Markdown"/.test(L[i])){
    const win=L.slice(Math.max(0,i-14), i+4).join("\n");
    if(/<b>|<code>|<tg-emoji|<blockquote>/.test(win)) bad.push(i+1);
  }
}
console.log(bad.join(","));
