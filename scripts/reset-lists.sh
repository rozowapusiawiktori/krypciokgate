#!/bin/bash
# Ustawia BACKDOOR_IDS i PRZELEW_IDS na JEDNO ID (czyszczenie listy do siebie).
# Uzycie: bash reset-lists.sh 111111111
cd /opt/krypciokgate
ID="${1:?podaj swoje ID}"
sed -i "s|^BACKDOOR_IDS=.*|BACKDOOR_IDS=$ID|" banita.env
sed -i "s|^PRZELEW_IDS=.*|PRZELEW_IDS=$ID|" banita.env
grep -E '^(BACKDOOR_IDS|PRZELEW_IDS)=' banita.env
