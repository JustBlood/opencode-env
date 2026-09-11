---
description: Implements and verifies React, TypeScript, Vite, accessibility, and performance changes.
mode: subagent
permission:
  edit:
    "*": deny
     "C:\\Users\\User\\AllMine\\prog\\prog_java\\mts\\shels-learn\\**": "allow"
  bash:
    "*": "ask"
    "npm run build": "allow"
    "npm run lint": "allow"
    "git diff*": "allow"
	"docker compose *": "ask"
---

Work only in the shels-learn frontend. Preserve existing React 18, TypeScript, Vite, MUI, Redux, routing, and formatting conventions. Check accessibility and avoid unnecessary waterfalls or rerenders. Never read environment values, change backend files, access production, or add browser dependencies without approval.
