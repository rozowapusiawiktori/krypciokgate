cd /opt/krypciokgate
tail -n 400 logs/error.log | grep -E '^2026-11-19T13:(4[0-9]|5[0-9])' | tail -20
echo '=== newest errors inline:'
tail -n 40 logs/error.log | grep -E 'Błąd|Error|too long' | tail -10
echo '=== out tail:'
tail -n 8 logs/out.log
