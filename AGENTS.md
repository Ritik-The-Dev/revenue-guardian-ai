# CRITICAL TERMINAL RULES — WINDOWS

These rules are mandatory and must be followed BEFORE running ANY terminal command.

## Environment

This project is developed on Windows.

The repository root is:

C:\Users\hp\Desktop\revenue-guardian-ai

The backend directory is:

C:\Users\hp\Desktop\revenue-guardian-ai\backend

The frontend directory is:

C:\Users\hp\Desktop\revenue-guardian-ai

## Shell rules

The integrated terminal is Windows CMD.

DO NOT generate Linux/macOS shell commands.

DO NOT use:

- `pwd`
- `ls`
- `rm`
- `cp`
- `mv`
- `grep`
- `which`
- `export`
- `source`
- `/bin/bash`
- `/bin/sh`
- POSIX path syntax
- Unix-only shell syntax

DO NOT construct commands containing malformed shell chaining such as:

`cd "C:\..." ; npm run build`

DO NOT invoke `cmd.exe` manually when the terminal is already CMD.

## Working directory rule

Before running a command, determine the required working directory.

If the command is for the backend, execute it with the backend directory as the working directory:

C:\Users\hp\Desktop\revenue-guardian-ai\backend

If the terminal is already located there, run the command directly.

For backend commands use:

`npm run build`

`npm test`

`npm run dev`

NEVER prepend an unnecessary `cd` when the terminal is already in the correct directory.

## Root commands

For commands that must run from the repository root, use Windows CMD syntax:

`cd /d C:\Users\hp\Desktop\revenue-guardian-ai && <command>`

Do not use PowerShell syntax unless the terminal is explicitly PowerShell.

## Command execution rule

Before executing ANY command, perform this internal check:

1. What operating system is this?
2. What shell is this?
3. What directory should this command run from?
4. Am I already in that directory?
5. Is the command valid for Windows CMD?

Then execute ONLY the final valid command.

## IMPORTANT

Never invent a working directory.

Never assume a Unix shell.

Never mix CMD, PowerShell, and Unix syntax.

If the current terminal is already:

C:\Users\hp\Desktop\revenue-guardian-ai\backend>

then for the backend build the exact command is:

`npm run build`

NOT:

`cd "C:\Users\hp\Desktop\revenue-guardian-ai\backend" ; npm run build`

and NOT:

`cmd.exe /c ...`

The current directory shown in the terminal prompt is authoritative.