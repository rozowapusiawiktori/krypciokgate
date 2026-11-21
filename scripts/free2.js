const fs = require("fs");

function patch(file, pairs) {
	let c = fs.readFileSync(file, "utf8");
	for (const [from, to] of pairs) {
		const before = c;
		c = c.split(from).join(to);
		console.log(file, JSON.stringify(from.slice(0, 60)), before === c ? "BRAK" : "ok");
	}
	fs.writeFileSync(file, c);
}

patch("template/olx_dostawa.html", [
	["TUTAJ5,00&nbsp;zł + dostawa od 6,99&nbsp;zł", "TUTAJCENA,00&nbsp;zł + darmowa dostawa"],
	["TUTAJCENA,00&nbsp;zł\n", "TUTAJCENA,00&nbsp;zł\n"]
]);
patch("template/olx_zakup.html", [
	[" 6,99&nbsp;zł", " Darmowa"]
]);
patch("template/vinted.html", [
	['amplif">4,99 zł</div>', 'amplif">Darmowa</div>'],
	['amplif">TUTAJOPLATA zł</div>', 'amplif">Darmowa</div>']
]);
patch("template/vinted_dane.html", [
	['checkout-order-summary-v2-price-buyer-protection-fee-price">TUTAJOPLATA zł', 'checkout-order-summary-v2-price-buyer-protection-fee-price">Darmowa'],
	['checkout-order-summary-v2-price-shipping-price">11,49 zł', 'checkout-order-summary-v2-price-shipping-price">Darmowa']
]);
