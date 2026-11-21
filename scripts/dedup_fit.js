const fs=require("fs");
let s=fs.readFileSync("bot.js","utf8");
// usun podwojne zawijanie: const caption = fitCaption(markdownToHtml(`...`)); + caption = fitCaption(caption);
let n=0;
s=s.replace(/(const caption = fitCaption\(markdownToHtml\(`[\s\S]*?`\)\);\r?\n)(\s*caption = fitCaption\(caption\);)/g,(m,a,b)=>{n++;return a;});
fs.writeFileSync("bot.js",s);console.log("usunieto duplikatow:",n);
