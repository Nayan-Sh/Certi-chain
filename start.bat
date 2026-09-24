@echo off
REM Local helper: boot MongoDB (if available), the Python AI service, and the Node backend.
REM Does not change application architecture — just starts existing services.

setlocal
cd /d "%~dp0"

echo [start] CertifyChain local services
echo   backend  - http://localhost:5000
echo   ai       - http://127.0.0.1:5001
echo   frontend - run separately: cd frontend ^&^& npm run dev
echo.

where mongod >nul 2>&1
if %ERRORLEVEL%==0 (
  echo [start] ensuring MongoDB is running...
  start "CertifyChain MongoDB" /MIN mongod
) else (
  echo [start] mongod not on PATH — assuming MongoDB is already running on 27017
)

echo [start] AI service (Flask :5001)
if exist "ai-service\venv\Scripts\python.exe" (
  start "CertifyChain AI" cmd /k "cd /d "%~dp0ai-service" && venv\Scripts\python.exe app.py"
) else (
  start "CertifyChain AI" cmd /k "cd /d "%~dp0ai-service" && python app.py"
)

echo [start] Node backend (:5000)
start "CertifyChain Backend" cmd /k "cd /d "%~dp0backend" && npm start"

echo [start] services launched in separate windows. Close those windows to stop them.
endlocal
