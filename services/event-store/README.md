# Event and state store

Owner: Aditri Tangeti (`GITHUB_LOGIN_ADITRI`). Replace that placeholder with the real GitHub login before anyone mentions Aditri.

This folder is the structured store for source-backed equipment events and task state, the dependency and omission checks, and the tests for those checks. Checks can report conflicts, omitted unresolved conditions, and dependency gaps. They do not mark a task cleared and do not authorize physical work.

No database or language is chosen. The field names to aim at are the draft in `contracts/PROPOSAL.md`. Ask Diego on the board before changing them. Transcription and the 3D view are not implemented here.
