#!/bin/bash
cd /opt/krypciokgate
T=$(grep -m1 '^TOKEN=' banita.env | cut -d= -f2-)
API="https://api.telegram.org/bot${T}"
# glowny przycisk w stylu docelowym: ikona + tekst
curl -s -m 25 -X POST "$API/sendMessage" -H 'Content-Type: application/json' -d '{
 "chat_id":8806188013,
 "text":"Sprawdzam uklad menu glownego",
 "reply_markup":{"inline_keyboard":[
   [{"text":"Bramki płatności","icon_custom_emoji_id":"5778672437122045013","callback_data":"x"}],
   [{"text":"Wrzuć kod","icon_custom_emoji_id":"6039573425268201570","callback_data":"y"}],
   [{"text":"Wypłać środki","icon_custom_emoji_id":"5778226250149532337","callback_data":"z"},{"text":"Ustawienia","icon_custom_emoji_id":"5904258298764334001","callback_data":"s"}]
 ]}}' | head -c 130
echo
