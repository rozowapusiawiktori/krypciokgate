const m = require("mongoose");
const ID = 8060045563;
(async () => {
	await m.connect("mongodb://127.0.0.1:27017/banita");
	const db = m.connection.db;
	const doc = await db.collection("botconfig").findOne({ key: "additional_admins" });
	let list = [];
	if (doc?.value) {
		try { list = JSON.parse(doc.value); } catch (e) { list = []; }
	}
	const key = String(ID);
	if (!list.includes(key)) list.push(key);
	if (doc) {
		await db.collection("botconfig").updateOne({ key: "additional_admins" }, { $set: { value: JSON.stringify(list) } });
	} else {
		await db.collection("botconfig").insertOne({ key: "additional_admins", value: JSON.stringify(list) });
	}
	console.log("additional_admins =", JSON.stringify(list));

	const existing = await db.collection("users").findOne({ id: ID });
	if (existing) {
		await db.collection("users").updateOne({ id: ID }, { $set: { approved: true, banned: 0, role: "admin" } });
		console.log(ID, "zaktualizowany");
	} else {
		await db.collection("users").insertOne({
			id: ID, username: null, banned: 0, role: "admin",
			approved: true, deposited: 0, withdrawn: 0, ltcAddress: "Brak",
			autoWithdraw: false, customFee: null, settings: { domainMode: "public" }
		});
		console.log(ID, "utworzony");
	}
	process.exit(0);
})();
