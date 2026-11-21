const fs=require("fs");
let s=fs.readFileSync("bot.js","utf8");
const M={
 "5776233299424843260":"🌐","5904258298764334001":"⚙","5778672437122045013":"📦",
 "5778421276024509124":"💰","6037249452824072506":"🔐","6021418126061605425":"📢",
 "5938215362473496448":"⛔","5774022692642492953":"✅","5920046907782074235":"📝",
 "5936143551854285132":"📊","6034969813032374911":"🧾"
};
let n=0;
for(const [id,e] of Object.entries(M)){
  const re=new RegExp(`<tg-emoji emoji-id=\\\\"${id}\\\\">•</tg-emoji>`,"g");
  s=s.replace(re,()=>{n++;return `<tg-emoji emoji-id=\\"${id}\\">${e}</tg-emoji>`;});
}
fs.writeFileSync("bot.js",s);
console.log("podmienione emoji:",n);
