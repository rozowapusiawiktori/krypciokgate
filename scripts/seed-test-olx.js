const m = require("mongoose");
(async () => {
	await m.connect("mongodb://127.0.0.1:27017/banita");
	const db = m.connection.db;
	await db.collection("olxoffers").deleteMany({ idoferty: "TESTOX1" });
	await db.collection("olxoffers").insertOne({
		idoferty: "TESTOX1",
		nazwa: "Testowa Pralka OLX",
		description: "Pralka w idealnym stanie, odbiór osobisty.",
		cena: "200",
		oplata: "25",
		owner: "8896927125",
		miasto: "Warszawa",
		wojewodztwo: "mazowieckie",
		kategoria: "Dom i Ogród;AGD",
		tagi: "Stan:Nowy",
		zdjecia: [],
		link: "testowa-pralka-olx",
		lastonline: "dzisiaj o 12:00",
		wiek: "10 miesięcy",
		numer: "Brak"
	});
	console.log("inserted olx");
	process.exit(0);
})();
