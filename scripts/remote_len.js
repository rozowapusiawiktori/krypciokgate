const fs=require("fs");
const src=fs.readFileSync("/opt/krypciokgate/bot.js","utf8");
function grab(m){const i=src.indexOf(m);let d=0,j=src.indexOf("{",i);for(let k=j;k<src.length;k++){if(src[k]==="{")d++;else if(src[k]==="}"){d--;if(!d)return src.slice(i,k+1);}}}
eval(grab("function fitCaption"));
eval(grab("function formatVintedOfferCaption"));
const offer={nazwa:"Kurtka The North Face Nuptse 700 czarna · rozmiar L",sprzedawca:"Ania",description:"Sprzedam kurtkę The North Face Nuptse 700 w kolorze czarnym, rozmiar L. Stan bardzo dobry.",cena:"620",cenaDostawy:"11.49",cenaOchrony:"4.99",nazwaFirmy:"Vinted Go",miasto:"Kraków",lastonline:"Dzisiaj o 15:32",kategoria:"Moda",tagi:"Stan: Bardzo dobry;Marka: The North Face;Rozmiar: L;Kolor: Czarny;Sezon: Zima",zdjecia:["1"]};
const link="https://vinted.x.cfd/id-582028-Kurtka-The-North-Face-Nuptse-700-czarna-rozmiar-L";
const md=t=>t.replace(/\*\*([^*]+)\*\*/g,"<b>$1</b>").replace(/\*([^*\n]+)\*/g,"<b>$1</b>").replace(/`([^`\n]+)`/g,"<code>$1</code>");
const cap=fitCaption(md(formatVintedOfferCaption(offer,link)));
console.log("LEN",cap.length);
