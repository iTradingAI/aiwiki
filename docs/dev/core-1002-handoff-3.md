# Plugin Signing Proposal Handoff Checklist
- Task ID: task-1002-3-signing
- Completed Files: [docs/plugins/PERMISSIONS.md, docs/plugins/PERMISSIONS.zh-CN.md]
- Test Coverage: {"manual contract check": ["both proposal sections contain the proposal-only statement and 12 numbered requirements", "English and Chinese requirements cover the same trust-boundary semantics", "no internal task identifier occurs in either permission document"], "zero implementation evidence": ["this task changes documentation only", "no src/ file is modified by this task"], "release gate": ["npm run release:check is blocked by the unfinished migration-slice link target docs/schema/README.zh-CN.md#迁移指南"]}
- Pending Integrations: [migration-slice correction followed by release-gate rerun, Critical change review, and security review before the security guide may link to this proposal]
- Handoff Notes: The proposal defines future signing requirements only: no signature verification, key management, revocation check, or import-time verification is implemented by this task. The current permission and plugin administration behavior remains unchanged.
- Sign-off: @Worker-1002-signing 2026-08-26
