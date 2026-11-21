const fs=require("fs");
let s=fs.readFileSync("bot.js","utf8");
let n=0;
// caption = markdownToHtml(...) -> caption = fitCaption(markdownToHtml(...))
const re=/(let |const )?caption\s*=\s*markdownToHtml\((`[\s\S]*?`)\);/g;
s=s.replace(re,(m,decl,body)=>{ n++; return `${decl||""}caption = fitCaption(markdownToHtml(${body}));`; });
fs.writeFileSync("bot.js",s);
console.log("fitCaption dodane:",n);
