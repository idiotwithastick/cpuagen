@echo off
REM Warhammer Price Scraper Launcher
echo Starting Warhammer Price Scraper...
cd /d "%~dp0"
python main.py %*
echo.
echo Scrape complete.
pause
