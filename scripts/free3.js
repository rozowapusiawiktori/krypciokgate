const fs = require("fs");
let c = fs.readFileSync("template/vinted.html", "utf8");
c = c.split('web_ui__Text__parent">11,49 zł</div>').join('web_ui__Text__parent">Darmowa</div>');
c = c.split('data-testid="item-shipping-banner-price">od 11,49 zł').join('data-testid="item-shipping-banner-price">Darmowa');
c = c.split('web_ui__Text__left web_ui__Text__amplified">4,99 zł</div>').join('web_ui__Text__left web_ui__Text__amplified">Darmowa</div>');
c = c.split('data-testid="total-combined-price">TUTAJCENA2 zł').join('data-testid="total-combined-price">TUTAJCENA2 zł');
fs.writeFileSync("template/vinted.html", c);
console.log("6,99:", /6,99/.test(c), "11,49:", /11,49/.test(c), "4,99:", /4,99/.test(c));
