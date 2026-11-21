import fs from "fs";

const env = Object.fromEntries(
	fs
		.readFileSync("banita.env", "utf8")
		.split(/\r?\n/)
		.filter((line) => line && !line.startsWith("#") && line.includes("="))
		.map((line) => {
			const i = line.indexOf("=");
			return [line.slice(0, i), line.slice(i + 1)];
		})
);

const domain = process.argv[2] || "pl-8512712.xyz";
const headers = {
	"X-Auth-Email": env.CLOUDFLARE_EMAIL,
	"X-Auth-Key": env.CLOUDFLARE_API_KEY,
	"Content-Type": "application/json",
};

const zoneRes = await fetch(
	`https://api.cloudflare.com/client/v4/zones?name=${encodeURIComponent(domain)}`,
	{ headers }
);
const zone = (await zoneRes.json()).result?.[0];
if (!zone) {
	console.log("Brak strefy CF dla:", domain);
	process.exit(1);
}

console.log("domain:", domain);
console.log("status:", zone.status);
console.log("cf_ns:", (zone.name_servers || []).join(", "));
console.log("registrar_ns:", (zone.original_name_servers || []).join(", ") || "BRAK");

const recRes = await fetch(
	`https://api.cloudflare.com/client/v4/zones/${zone.id}/dns_records`,
	{ headers }
);
const records = (await recRes.json()).result || [];
console.log("dns_records:", records.length);
for (const rec of records) {
	console.log(` - ${rec.type} ${rec.name} -> ${rec.content} (proxied=${rec.proxied})`);
}
