const fs=require("fs");
const L=fs.readFileSync("bot.js","utf8").split("\n");
let bad=0;
for(let i=0;i<L.length;i++){
  const l=L[i];
  if(/<b>|<code>/.test(l) && /\*[A-Za-zĄĆĘŁŃÓŚŹŻ]/.test(l) && !/markdownToHtml/.test(l)){
    // pomijaj linie gdzie * jest w srodku stringa (np. mnozenie)
    if(/`› [^`]*\*/.test(l)){ console.log("L"+(i+1)+": "+l.trim().slice(0,100)); bad++; }
  }
}
console.log("pozostalo:",bad);
