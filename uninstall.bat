@echo off
setlocal
reg delete "HKCU\Software\Google\Chrome\NativeMessagingHosts\com.vdhlite.ytdlp" /f
echo Removed VDH Lite Custom native host registration.
pause
