const TG=require("/opt/krypciokgate/node_modules/node-telegram-bot-api");
const fs=require("fs");
const TOKEN=(fs.readFileSync("/opt/krypciokgate/banita.env","utf8").match(/^TOKEN=(.+)$/m)||[])[1].trim();
const bot=new TG(TOKEN,{polling:false});
const pe=(i,e)=>`<tg-emoji emoji-id="${i}">${e}</tg-emoji>`;
const CHAT=8806188013;
const send=async(cap,kb)=>{const m=await bot.sendPhoto(CHAT,fs.createReadStream("/opt/krypciokgate/banita.png"),{caption:"p",parse_mode:"HTML"});await bot.editMessageMedia({type:"photo",media:"attach://banita.png",parse_mode:"HTML",caption:cap},{chat_id:CHAT,message_id:m.message_id,reply_markup:kb});};
(async()=>{
await send(`${pe("5776233299424843260","🌐")} <b>Krypciok Gate</b>`, {inline_keyboard:[[{text:"Menu główne",icon_custom_emoji_id:"5895507195524550741",callback_data:"m"}]]});
await send(`${pe("5776233299424843260","🌐")} <b>Bramka płatności</b>\n\n${pe("5776023601941582822","💎")} <b>Platforma:</b> <code>vinted</code>`,
 {inline_keyboard:[
  [{text:"Nowa oferta",icon_custom_emoji_id:"6032924188828767321",callback_data:"a"},{text:"Twoje oferty",icon_custom_emoji_id:"6034969813032374911",callback_data:"b"}],
  [{text:"Wróć",icon_custom_emoji_id:"5895507195524550741",callback_data:"c"}]
 ]});
await send(`${pe("6034969813032374911","📃")} <b>Twoje oferty</b>`,
 {inline_keyboard:[
  [{text:"iPhone 15 Pro",callback_data:"a"}],
  [{text:"Cofnij",icon_custom_emoji_id:"5895507195524550741",callback_data:"b"},{text:"Usuń wszystkie oferty",icon_custom_emoji_id:"6039522349517115015",callback_data:"c"}]
 ]});
console.log("OK");
})();
