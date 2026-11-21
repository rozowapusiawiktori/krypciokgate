@echo off
title KrypciokGate - instalator
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0START-HERE.ps1"
if errorlevel 1 pause
