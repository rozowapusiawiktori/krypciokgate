const fs=require("fs");
const L=fs.readFileSync("bot.js","utf8").split("\n");
let n=0;
for(let i=0;i<L.length;i++){
  const before=L[i];
  // tylko linie w template stringach zaczynajace sie od `› *Label:* `
  L[i]=L[i].replace(/`› \*([^*\n]+):\* /g, "`› <b>$1:</b> ");
  if(L[i]!==before) n++;
}
fs.writeFileSync("bot.js",L.join("\n"));
console.log("poprawione linie:",n);
