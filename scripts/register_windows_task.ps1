# ============================================================================
# ريحانة للوحدات السكنية (Rayhana Residential Units)
# تسجيل مهمة مجدولة في Windows Task Scheduler لتعمل يومياً الساعة 12:00 منتصف الليل
# ============================================================================

$ScriptPath = Join-Path $PSScriptRoot "daily_backup_12am.bat"

if (-not (Test-Path $ScriptPath)) {
    Write-Host "خطأ: لم يتم العثور على ملف daily_backup_12am.bat في: $ScriptPath" -ForegroundColor Red
    exit 1
}

$TaskName = "Rayhana_DailyBackup_12AM"
$Action = New-ScheduledTaskAction -Execute $ScriptPath
$Trigger = New-ScheduledTaskTrigger -Daily -At "12:00AM"
$Principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType Interactive -RunLevel Highest
$Settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable

try {
    Register-ScheduledTask -TaskName $TaskName -Action $Action -Trigger $Trigger -Principal $Principal -Settings $Settings -Description "النسخ الاحتياطي التلقائي اليومي لمنظومة ريحانة للوحدات السكنية كل ليلة الساعة 12:00 منتصف الليل" -Force
    Write-Host "----------------------------------------------------------------" -ForegroundColor Green
    Write-Host "✓ تم تسجيل مهمة النسخ الاحتياطي اليومي بنجاح في Windows Task Scheduler!" -ForegroundColor Green
    Write-Host "  اسم المهمة: $TaskName" -ForegroundColor Cyan
    Write-Host "  التوقيت المجدول: يومياً الساعة 12:00 AM (منتصف الليل)" -ForegroundColor Cyan
    Write-Host "----------------------------------------------------------------" -ForegroundColor Green
} catch {
    Write-Host "حدث خطأ أثناء تسجيل المهمة في Windows: $_" -ForegroundColor Red
}
