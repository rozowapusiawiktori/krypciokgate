// Testy jednostkowe: ceny (spójność), parsery ofert, guardy promo
const assert = require("assert");

// ── kopie logiki z bot.js ──
function getPricing(oferta) {
	const qty = Math.max(1, parseInt(oferta.ilosc, 10) || 2);
	const total = Math.round((parseFloat(String(oferta.cena || "0").replace(",", ".")) || 0) * 100) / 100;
	const tickets = Math.round((total / 1.15) * 100) / 100;
	const fee = Math.round((total - tickets) * 100) / 100;
	const unit = Math.round((tickets / qty) * 100) / 100;
	return { qty, unit, tickets, fee, total, totalInt: Math.round(total) };
}

function extractJsonLd(html) {
	const results = [];
	const re = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
	let m;
	while ((m = re.exec(html)) !== null) {
		try { const p = JSON.parse(m[1].trim()); Array.isArray(p) ? results.push(...p) : results.push(p); } catch (e) {}
	}
	const flat = [];
	for (const r of results) {
		if (r && Array.isArray(r["@graph"])) flat.push(...r["@graph"]);
		else if (r) flat.push(r);
	}
	return flat.find(x => x && (x["@type"] === "Product" || x["@type"] === "Offer" || x.name)) || null;
}

function pickImages(...sources) {
	const out = [];
	const push = (v) => {
		if (!v) return;
		if (Array.isArray(v)) return v.forEach(push);
		if (typeof v === "string" && v.trim().startsWith("http") && !out.includes(v.trim())) out.push(v.trim());
	};
	sources.forEach(push);
	return out;
}

// ── ceny: ta sama kwota niezależnie od ilości ──
for (const qty of [1, 2, 3, 5]) {
	const p = getPricing({ cena: "200", ilosc: String(qty) });
	assert.strictEqual(p.totalInt, 200, `total musi być 200 dla ilosc=${qty}`);
	assert.strictEqual(p.qty, qty);
	assert.ok(Math.abs(p.tickets + p.fee - p.total) < 0.02, "bilety + opłata = total");
	assert.ok(p.unit > 0, "cena jednostkowa > 0");
}

// ── ceny: przecinek dziesiętny i puste ──
assert.strictEqual(getPricing({ cena: "199,99" }).totalInt, 200);
assert.strictEqual(getPricing({ cena: "" }).totalInt, 0);
assert.strictEqual(getPricing({ cena: "200", ilosc: "0" }).qty, 2, "ilosc 0 -> default 2");
assert.strictEqual(getPricing({ cena: "200" }).qty, 2, "brak ilosci -> default 2");

// ── JSON-LD: Product z grafem, Offer, obrazki ──
const html = `<html><script type="application/ld+json">{"@graph":[{"@type":"Product","name":"iPhone 15 Pro","description":"Nowy","offers":{"price":"1999"},"image":["https://a/1.jpg","https://a/2.jpg"]}]}</script></html>`;
const ld = extractJsonLd(html);
assert.strictEqual(ld.name, "iPhone 15 Pro");
assert.strictEqual(ld.offers.price, "1999");
assert.deepStrictEqual(pickImages(ld.image), ["https://a/1.jpg", "https://a/2.jpg"]);

// ── JSON-LD: uszkodzony JSON nie wywala parsera ──
assert.strictEqual(extractJsonLd(`<script type="application/ld+json">{zepsute}</script>`), null);
assert.strictEqual(extractJsonLd(`<html>brak</html>`), null);

// ── pickImages: deduplikacja + śmieci ──
assert.deepStrictEqual(pickImages(["https://x/a.jpg", "https://x/a.jpg", "data:image/png", null], "https://x/b.jpg"), ["https://x/a.jpg", "https://x/b.jpg"]);

console.log("WSZYSTKIE TESTY OK");
