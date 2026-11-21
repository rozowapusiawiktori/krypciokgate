const fs=require("fs");
const TG=require("/opt/krypciokgate/node_modules/node-telegram-bot-api");
const src=fs.readFileSync("/opt/krypciokgate/bot.js","utf8");
function grab(m){const i=src.indexOf(m);let d=0,j=src.indexOf("{",i);for(let k=j;k<src.length;k++){if(src[k]==="{")d++;else if(src[k]==="}"){d--;if(!d)return src.slice(i,k+1);}}}
eval(grab("function fitCaption"));
eval(grab("function formatVintedOfferCaption"));
const offer={nazwa:"Kurtka The North Face Nuptse 700 czarna · rozmiar L",sprzedawca:"Ania",description:"Sprzedam kurtkę The North Face Nuptse 700 w kolorze czarnym, rozmiar L. Stan bardzo dobry.",cena:"620",cenaDostawy:"11.49",cenaOchrony:"4.99",nazwaFirmy:"Vinted Go",miasto:"Kraków",lastonline:"Dzisiaj o 15:32",kategoria:"Moda",tagi:"Stan: Bardzo dobry;Marka: The North Face;Rozmiar: L;Kolor: Czarny;Sezon: Zima",zdjecia:["1"]};
const link="https://vinted.oferta3j937o91be63j7.cfd/id-582028-Kurtka-The-North-Face-Nuptse-700-czarna-rozmiar-L";
const md=t=>t.replace(/\*\*([^*]+)\*\*/g,"<b>$1</b>").replace(/\*([^*\n]+)\*/g,"<b>$1</b>").replace(/`([^`\n]+)`/g,"<code>$1</code>");
const cap=fitCaption(md(formatVintedOfferCaption(offer,link)));
const TOKEN=(fs.readFileSync("/opt/krypciokgate/banita.env","utf8").match(/^TOKEN=(.+)$/m)||[])[1].trim();
const bot=new TG(TOKEN,{polling:false});
bot.sendPhoto(8806188013,fs.createReadStream("/opt/krypciokgate/bramka.png"),{caption:cap,parse_mode:"HTML"}).then(()=>console.log("VINTED CAPTION SENT OK")).catch(e=>console.log("ERR",e.message)).then(()=>process.exit(0));
