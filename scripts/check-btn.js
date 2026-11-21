const c = require("fs").readFileSync("bot.js", "utf8");
const count = (re) => (c.match(re) || []).length;
console.log("puste etykiety:", count(/text: "", icon_custom/g));
console.log("wiodaca spacja:", count(/text: " [A-Za-z]/g));
console.log("dubel icon:", count(/icon_custom_emoji_id: "\d+", icon_custom/g));
console.log("icon lacznie:", count(/icon_custom_emoji_id/g));
console.log("zostale tagi w text:", count(/text: [^,]*tg-emoji/g));
