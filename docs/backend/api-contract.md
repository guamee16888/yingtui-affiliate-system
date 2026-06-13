# API Contract v1

All responses use:

```json
{ "ok": true, "data": {} }
```

Errors use:

```json
{ "ok": false, "error": "Readable error", "code": "ERROR_CODE" }
```

## Session

`GET /api/app/v1/session`

- role: authenticated user
- scope: current session only
- returns: user, role, workspace memberships
- never returns: token, cookie secret, OAuth secret

## Admin APIs for admin.guamee.org

`GET /api/app/v1/admin/workspaces`

- role: admin
- scope: platform global
- returns: workspace list and health summary
- never returns: workspace private copy text unless requested by admin detail API

`GET /api/app/v1/admin/source-lanes`

- role: admin
- scope: platform global
- returns: content lanes, connector status, source health
- never returns: connector secret

`GET /api/app/v1/admin/candidates`

- role: admin
- scope: platform global
- returns: raw candidates with risk flags
- never returns: API keys or token material

## Manager APIs for app.guamee.org

`GET /api/app/v1/manager/summary`

- role: manager or admin
- required params: workspaceId
- scope: selected workspace only
- returns: accounts, staff/operators, tasks, feedback debt, publish job summary
- never returns: other workspace records

`GET /api/app/v1/manager/tasks`

- role: manager or admin
- required params: workspaceId, optional status
- scope: selected workspace only
- returns: task cards and safe copy fields
- never returns: platform source connector secrets

`POST /api/app/v1/manager/tasks/approve`

- role: manager or admin
- required params: workspaceId, taskId
- scope: selected workspace only
- writes: post_tasks approval fields and audit_logs
- gate: task must fit 280 weighted characters and duplicate checker must not block

`POST /api/app/v1/manager/tasks/reject`

- role: manager or admin
- required params: workspaceId, taskId, reason
- scope: selected workspace only
- writes: post_tasks status and audit_logs

`POST /api/app/v1/manager/tasks/assign`

- role: manager or admin
- required params: workspaceId, taskId, accountId, assignedTo
- scope: selected workspace only
- gate: account and assigned user must belong to workspace

`GET /api/app/v1/manager/accounts`

- role: manager or admin
- required params: workspaceId
- scope: selected workspace only
- returns: up to workspace account limit, default 30

`GET /api/app/v1/manager/staff`

- role: manager or admin
- required params: workspaceId
- scope: selected workspace only
- returns: operators inside the workspace

`GET /api/app/v1/manager/publish-jobs`

- role: manager or admin
- required params: workspaceId
- scope: selected workspace only
- returns: dry-run and queued publish jobs

`GET /api/app/v1/manager/feedback-debt`

- role: manager or admin
- required params: workspaceId
- scope: selected workspace only
- returns: tasks waiting for X Analytics feedback

## Staff APIs

These APIs can remain private implementation endpoints. They should not be advertised as a public product entry on `guamee.org`.

`GET /api/app/v1/staff/me`

- role: staff, manager, or admin
- scope: current user only
- returns: assigned accounts and workspace membership

`GET /api/app/v1/staff/tasks`

- role: staff, manager, or admin
- required params: workspaceId
- scope: assigned tasks only for staff, workspace tasks for manager/admin

`POST /api/app/v1/staff/tasks/copied`

- role: staff, manager, or admin
- required params: workspaceId, taskId
- writes: copiedAt and audit_logs

`POST /api/app/v1/staff/tasks/posted`

- role: staff, manager, or admin
- required params: workspaceId, taskId, postedUrl optional
- writes: post_ledger, feedback debt, audit_logs

`POST /api/app/v1/staff/tasks/feedback`

- role: staff, manager, or admin
- required params: workspaceId, taskId, metrics
- writes: feedback and audit_logs

`POST /api/app/v1/staff/tasks/skip`

- role: staff, manager, or admin
- required params: workspaceId, taskId, reason optional
- writes: post_tasks skip status and audit_logs
