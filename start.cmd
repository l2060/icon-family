@echo off
setlocal
if "%PORT%"=="" set PORT=3000
node --use-system-ca server\index.mjs
