const TG=require("/opt/krypciokgate/node_modules/node-telegram-bot-api");
const fs=require("fs");
const TOKEN=(fs.readFileSync("/opt/krypciokgate/banita.env","utf8").match(/^TOKEN=(.+)$/m)||[])[1].trim();
const bot=new TG(TOKEN,{polling:false});
const pe=(i,e)=>`<tg-emoji emoji-id="${i}">${e}</tg-emoji>`;
const CHAT=8806188013;
const send=async(cap,kb)=>{const m=await bot.sendPhoto(CHAT,fs.createReadStream("/opt/krypciokgate/banita.png"),{caption:"p",parse_mode:"HTML"});await bot.editMessageMedia({type:"photo",media:"attach://banita.png",parse_mode:"HTML",caption:cap},{chat_id:CHAT,message_id:m.message_id,reply_markup:kb});};
(async()=>{
// oferta edycja
await send(`${pe("6039779802741739617","✏")} <b>Edytujesz ofertę</b>\n\n<blockquote>${pe("5778672437122045013","📦")} <b>Nazwa:</b> <code>iPhone 15 Pro 256GB</code>\n${pe("5920046907782074235","📝")} <b>Opis:</b> <code>Stan idealny, komplet</code>\n${pe("5778613750688911681","💰")} <b>Cena:</b> <code>3499 zł</code>\n${pe("6032994772321309200","👤")} <b>Sprzedawca:</b> <code>Jan K.</code>\n${pe("6030399199030284183","📍")} <b>Miasto:</b> <code>Warszawa, mazowieckie</code>\n${pe("5766994197705921104","🗂")} <b>Kategoria:</b> <code>Elektronika</code>\n${pe("5888620056551625531","🏷")} <b>Tagi:</b> <code>iphone, apple</code>\n${pe("6032994772321309200","👤")} <b>Wiek:</b> <code>12</code>\n${pe("5775896410780079073","🕐")} <b>Ostatnie online:</b> <code>Dzisiaj o 15:20</code>\n${pe("6039605143601680423","📞")} <b>Numer:</b> <code>500100200</code>\n${pe("6037397706505195857","👁")} <b>Rodzaj:</b> <code>OSOBA PRYWATNA</code>\n${pe("5881806211195605908","📸")} <b>Ilość zdjęć:</b> 3</blockquote>\n\n${pe("6041730074376410123","📥")} <a href="https://olx.pl">Link do oferty</a>`,
 {inline_keyboard:[
  [{text:"Edytuj nazwę",icon_custom_emoji_id:"6039779802741739617",callback_data:"a"},{text:"Edytuj opis",icon_custom_emoji_id:"5920046907782074235",callback_data:"b"}],
  [{text:"Edytuj cenę",icon_custom_emoji_id:"5778421276024509124",callback_data:"c"},{text:"Edytuj sprzedawcę",icon_custom_emoji_id:"6032994772321309200",callback_data:"d"}],
  [{text:"Dodaj zdjęcia",icon_custom_emoji_id:"6030506650522096180",callback_data:"e"},{text:"Usuń zdjęcia",icon_custom_emoji_id:"6039522349517115015",callback_data:"f"}],
  [{text:"Usuń ofertę",icon_custom_emoji_id:"6030757850274336631",callback_data:"g"}],
  [{text:"Cofnij",icon_custom_emoji_id:"5895507195524550741",callback_data:"h"}]
 ]});
// podsumowanie kodu z bramki
await bot.sendMessage(CHAT, `<b>Brak adresu LTC</b>\n<blockquote>• Przejdź do <b>Ustawienia</b> i ustaw swój adres LTC.</blockquote>`, {parse_mode:"HTML"});
console.log("OK");
})();
