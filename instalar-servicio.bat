@echo off
chcp 65001 > nul
echo ====================================================
echo  LefTor Sport Gym - Instalador de Servicio Windows
echo ====================================================

:: Verificar permisos de Administrador
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo [ERROR] Este script requiere permisos de Administrador.
    echo Por favor haga clic derecho y seleccione "Ejecutar como administrador".
    pause
    exit /b 1
)

set SERVICE_NAME=LeftorGymAgent
set AGENT_DIR=%~dp0
set NODE_EXE=node.exe

echo.
echo [*] Directorio de instalacion: %AGENT_DIR%
echo [*] Configurando servicio con NSSM...

if not exist "%AGENT_DIR%nssm.exe" (
    echo [*] Descargando utilidad de servicios NSSM...
    powershell -Command "Invoke-WebRequest -Uri 'https://nssm.cc/release/nssm-2.24.zip' -OutFile '%AGENT_DIR%nssm.zip'"
    powershell -Command "Expand-Archive -Path '%AGENT_DIR%nssm.zip' -DestinationPath '%AGENT_DIR%nssm_temp'"
    copy "%AGENT_DIR%nssm_temp\nssm-2.24\win64\nssm.exe" "%AGENT_DIR%nssm.exe" > nul
    rmdir /s /q "%AGENT_DIR%nssm_temp"
    del "%AGENT_DIR%nssm.zip"
)

:: Detener e instalar servicio
"%AGENT_DIR%nssm.exe" stop %SERVICE_NAME% > nul 2>&1
"%AGENT_DIR%nssm.exe" remove %SERVICE_NAME% confirm > nul 2>&1

"%AGENT_DIR%nssm.exe" install %SERVICE_NAME% "%NODE_EXE%" "%AGENT_DIR%src\index.js"
"%AGENT_DIR%nssm.exe" set %SERVICE_NAME% AppDirectory "%AGENT_DIR%"
"%AGENT_DIR%nssm.exe" set %SERVICE_NAME% Description "LefTor Sport Gym - Agente de Control de Acceso y Molinete ZKTeco"
"%AGENT_DIR%nssm.exe" set %SERVICE_NAME% Start SERVICE_AUTO_START
"%AGENT_DIR%nssm.exe" set %SERVICE_NAME% AppStdout "%AGENT_DIR%logs\agent.log"
"%AGENT_DIR%nssm.exe" set %SERVICE_NAME% AppStderr "%AGENT_DIR%logs\error.log"
"%AGENT_DIR%nssm.exe" set %SERVICE_NAME% AppRotateFiles 1
"%AGENT_DIR%nssm.exe" set %SERVICE_NAME% AppRotateOnline 1
"%AGENT_DIR%nssm.exe" set %SERVICE_NAME% AppRotateSeconds 86400

if not exist "%AGENT_DIR%logs" mkdir "%AGENT_DIR%logs"

echo [*] Iniciando servicio...
"%AGENT_DIR%nssm.exe" start %SERVICE_NAME%

echo.
echo ====================================================
echo  [OK] Servicio LeftorGymAgent instalado e iniciado!
echo  Arrancara automaticamente cada vez que encienda el PC.
echo ====================================================
pause
