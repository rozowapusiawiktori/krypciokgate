const fs=require("fs");
const L=fs.readFileSync("bot.js","utf8").split("\n");
let n=0;
for(let i=0;i<L.length;i++){
 const l=L[i];
 if(/caption:?\s*[`"]/.test(l) || /^\s*`[^`]*\*[A-ZĄĆĘŁŃÓŚŹŻ]/.test(l)){
   const win=L.slice(Math.max(0,i-4), i+16).join("\n");
   if(/\*[A-ZĄĆĘŁŃÓŚŹŻa-z]/.test(l) && !/markdownToHtml/.test(win) && !/<b>/.test(l)){
     console.log("L"+(i+1)+": "+l.trim().slice(0,110)); n++;
   }
 }
}
console.log("podejrzane:",n);
