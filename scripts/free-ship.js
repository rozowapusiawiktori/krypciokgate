const fs = require("fs");
const p = "template/olx.html";
let c = fs.readFileSync(p, "utf8");

// „+ dostawa od 6,99 zł" -> darmowa dostawa
c = c.replace(/\+ dostawa od 6,99 zł/g, "+ darmowa dostawa");

// breakdown w modalu: usuwamy usługę serwisową i dostawę, suma = cena
c = c.replace(
	'<div class="css-gnnigb"><span class="css-73tjez">Usługa serwisowa</span><div class="css-wcmuax"><span class="css-4sn9du">TUTAJOPLATA zł</span></div></div><div class="css-gnnigb"><span class="css-73tjez">Dostawa od*</span><div class="css-wcmuax"><span class="css-4sn9du">6,99 zł</span></div></div>',
	'<div class="css-gnnigb"><span class="css-73tjez">Dostawa</span><div class="css-wcmuax"><span class="css-4sn9du">Darmowa</span></div></div>'
);
c = c.replace(
	'<span class="css-ebserp">Łączna cena od</span><span class="css-ebserp">TUTAJ5,00 zł</span>',
	'<span class="css-ebserp">Łączna cena</span><span class="css-ebserp">TUTAJCENA zł</span>'
);
c = c.replace(/\*Obliczana przy wyborze dostawcy\./g, "Dostawa gratis dla wszystkich ofert.");

fs.writeFileSync(p, c);
console.log("olx.html ok", /TUTAJOPLATA/.test(c), /6,99/.test(c));
