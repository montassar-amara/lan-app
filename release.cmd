@echo off
if "%1"=="" (echo usage: release 1.0.1 & exit /b 1)
git diff --quiet && git diff --cached --quiet || (echo Commit first & exit /b 1)
git push || exit /b 1
git tag v%1 || exit /b 1
git push origin v%1
