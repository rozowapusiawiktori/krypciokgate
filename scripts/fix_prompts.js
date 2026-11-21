const fs = require('fs');
let s = fs.readFileSync('bot.js', 'utf8');

const OLD = 'bot.sendMessage(chatId, `${prompt}\\n\\n(Aby anulowac wpisz stop lub cancel)`).then(sentMessage => {';
let n = 0;
s = s.split(OLD).join(
	'bot.sendMessage(chatId, markdownToHtml(`───────── [ 𝕂 ] ─────────\\n❖ *EDYCJA OFERTY*\\n──────────────────\\n\\n› ${prompt}\\n\\n› Aby anulować wpisz \\`stop\\`.`), { parse_mode: "HTML" }).then(sentMessage => {'
);
// policz pozostałości
n = s.split('EDYCJA OFERTY').length - 1;
fs.writeFileSync('bot.js', s);
console.log('prompt blocks now styled:', n);
