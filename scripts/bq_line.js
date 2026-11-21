const fs=require("fs");
const L=fs.readFileSync("bot.js","utf8").split("\n");

for(let i=0;i<L.length;i++){
  if(!L[i].includes("<blockquote>")) continue;
  // znajdz koniec wyrazenia: linia konczaca sie przecinkiem/średnikiem lub nawiasem
  let j=i;
  while(j<L.length){
    const t=L[j].trimEnd();
    if(!/^\s*`?[^`]*`\s*\+\s*$/.test(t) && !/^[^`]*\+\s*$/.test(t)) break;
    // linia konczy sie na "+" -> kontynuacja
    if(!/`\s*\+\s*$/.test(t) && !/\+\s*$/.test(t)) break;
    j++;
    if(j>i+60) break;
  }
  // sprawdz czy ostatnia linia wyglada na konczaca (ma ; , ) )
  if(!/[;,)]\s*$/.test(L[j].trimEnd()) && j<L.length-1){
    // szukaj dalej do 5 linii
    let k=j;
    while(k<L.length && k<j+6 && !/[;,)]\s*$/.test(L[k].trimEnd())) k++;
    if(k<L.length) j=k; else continue;
  }
  // usun wszystkie </blockquote> w zakresie i..j i wstaw na koniec ostatniego literalu
  for(let x=i;x<=j;x++) L[x]=L[x].replace(/<\/blockquote>/g,"");
  // wstaw przed ostatnim backtickiem w linii j
  const lastBt = L[j].lastIndexOf("`");
  if(lastBt>=0) L[j] = L[j].slice(0,lastBt) + "</blockquote>" + L[j].slice(lastBt);
  else L[j] = L[j].replace(/([;,)])/, "</blockquote>$1");
  i=j;
}
const out=L.join("\n");
fs.writeFileSync("bot.js",out);
console.log("open:",(out.match(/<blockquote>/g)||[]).length,"close:",(out.match(/<\/blockquote>/g)||[]).length);
