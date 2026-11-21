const fs=require("fs");
const L=fs.readFileSync("bot.js","utf8").split("\n");
for(let i=0;i<L.length;i++){
  const l=L[i];
  if(/<b>|<code>/.test(l) && /`[^`]*\*[A-Za-zĄĆĘŁŃÓŚŹŻ][^`]*`/.test(l)){
    console.log("L"+(i+1)+": "+l.trim().slice(0,110));
  }
}
