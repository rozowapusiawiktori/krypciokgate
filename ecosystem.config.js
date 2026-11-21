// Domyslnie JEDEN proces (both) — /start dziala od razu, tunnel bez zmian.
// Split na 2 procesy tylko przy duzym DDoS — wtedy tunnel: bottestowy.xyz -> :8080
module.exports = {
	apps: [
		{
			name: "krypciokgate",
			script: "bot.js",
			cwd: __dirname,
			env: {
				APP_ROLE: "both",
				PORT: "8080",
				WEBHOOK_PORT: "8080",
				NODE_OPTIONS: "--max-old-space-size=1536",
				CHROMIUM_PATH: "/usr/bin/chromium-browser"
			},
			max_memory_restart: "1800M",
			autorestart: true,
			max_restarts: 20,
			restart_delay: 5000,
			watch: false,
			time: true,
			error_file: "logs/error.log",
			out_file: "logs/out.log",
			merge_logs: true
		}
	]
};
