@echo off
chcp 65001 > nul
echo ====================================================
echo  LefTor Sport Gym - Desinstalador de Servicio
echo ====================================================

net session >nul 2>&1
if %errorLevel% neq 0 (
    echo [ERROR] Este script requiere permisos de Administrador.
    pause
    exit /b 1
)

set SERVICE_NAME=LeftorGymAgent
set AGENT_DIR=%~dp0

if exist "%AGENT_DIR%nssm.exe" (
    "%AGENT_DIR%nssm.exe" stop %SERVICE_NAME%
    "%AGENT_DIR%nssm.exe" remove %SERVICE_NAME% confirm
    echo [OK] Servicio detenido y desinstalado.
) else (
    sc stop %SERVICE_NAME%
    sc delete %SERVICE_NAME%
    echo [OK] Servicio eliminado mediante Windows SC.
)

pause
