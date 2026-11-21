const TG=require("/opt/krypciokgate/node_modules/node-telegram-bot-api");
const fs=require("fs");
const TOKEN=(fs.readFileSync("/opt/krypciokgate/banita.env","utf8").match(/^TOKEN=(.+)$/m)||[])[1].trim();
const bot=new TG(TOKEN,{polling:false});
const ids=["6039779802741739617","5920046907782074235","5778421276024509124","5778672437122045013","6030537007350944596","5938492039971737551","6032994772321309200","6030399199030284183","5774022692642492953","5888620056551625531","6032924188828767321","6039522349517115015","6039605143601680423","6030757850274336631","5895507195524550741"];
(async()=>{
 for(const id of ids){
  try{ await bot.sendMessage(8806188013,`test`,{reply_markup:{inline_keyboard:[[{text:"x",icon_custom_emoji_id:id,callback_data:"x"}]]}}); }
  catch(e){ console.log("BAD",id,e.message.slice(0,90)); }
 }
 console.log("KONIEC");
})();
