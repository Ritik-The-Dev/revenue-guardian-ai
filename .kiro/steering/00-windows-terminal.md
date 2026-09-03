---
inclusion: always
---

# Windows Terminal — MANDATORY

This project runs on Windows.

Repository root:
C:\Users\hp\Desktop\revenue-guardian-ai

Backend:
C:\Users\hp\Desktop\revenue-guardian-ai\backend

The integrated terminal is Windows CMD.

Before every terminal command:

1. Inspect the current working directory from the terminal prompt.
2. Determine whether the command belongs to root or backend.
3. Run the command directly if already in the correct directory.
4. Never mix shell syntaxes.

Backend commands when already in backend:

npm run build
npm test
npm run dev

Root commands:

cd /d C:\Users\hp\Desktop\revenue-guardian-ai && <command>

NEVER use:

cd "C:\...\backend" ; npm run build

NEVER manually invoke cmd.exe when already inside CMD.

NEVER use Unix commands or paths.

The terminal's current directory is authoritative.