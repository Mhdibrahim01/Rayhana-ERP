@echo off
setlocal enabledelayedexpansion

:: ============================================================================
:: ريحانة للوحدات السكنية (Rayhana Residential Units)
:: سكربت النسخ الاحتياطي التلقائي اليومي (12:00 AM) لجدولة مهام ويندوز
:: ============================================================================

set "APP_DATA=%APPDATA%\rayhana-suites"
set "DB_FILE=%APP_DATA%\rayhana_erp.sqlite"
set "BACKUP_DIR=%APP_DATA%\backups"
set "DOCS_DIR=%USERPROFILE%\Documents\Rayhana_Backups"

:: Fallback if running on legacy database
if not exist "%DB_FILE%" (
    if exist "%APPDATA%\ahmed-hotel-erp\ahmed_hotel_erp.sqlite" (
        set "APP_DATA=%APPDATA%\ahmed-hotel-erp"
        set "DB_FILE=%APPDATA%\ahmed-hotel-erp\ahmed_hotel_erp.sqlite"
        set "BACKUP_DIR=%APPDATA%\ahmed-hotel-erp\backups"
    )
)

if not exist "%BACKUP_DIR%" (
    mkdir "%BACKUP_DIR%"
)
if not exist "%DOCS_DIR%" (
    mkdir "%DOCS_DIR%"
)

for /f %%I in ('powershell -NoProfile -Command "Get-Date -Format yyyy-MM-dd"') do set "DATE_STR=%%I"

if "%DATE_STR%"=="" (
    set "DATE_STR=%date:~10,4%-%date:~4,2%-%date:~7,2%"
)

set "BACKUP_NAME=rayhana_daily_backup_%DATE_STR%_12-00-AM.sqlite"
set "TARGET_PATH=%BACKUP_DIR%\%BACKUP_NAME%"
set "MIRROR_PATH=%DOCS_DIR%\%BACKUP_NAME%"

if exist "%DB_FILE%" (
    copy /Y "%DB_FILE%" "%TARGET_PATH%" >nul
    copy /Y "%DB_FILE%" "%BACKUP_DIR%\rayhana_daily_backup_latest.sqlite" >nul
    copy /Y "%DB_FILE%" "%MIRROR_PATH%" >nul
    copy /Y "%DB_FILE%" "%DOCS_DIR%\rayhana_daily_backup_latest.sqlite" >nul
    echo [OK] تم أخذ النسخة الاحتياطية اليومية بنجاح: %BACKUP_NAME%
) else (
    echo [ERROR] ملف قاعدة البيانات غير موجود في المسار: %DB_FILE%
)
