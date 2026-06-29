# Possum Fixture Apps

These apps are intentionally broken local targets for checking Possum findings.

Run any fixture directly:

```bash
PORT=4180 node fixtures/apps/beginner-dead-end/server.mjs
PORT=4181 node fixtures/apps/impatient-double-submit/server.mjs
PORT=4182 node fixtures/apps/hostile-server-error/server.mjs
PORT=4183 node fixtures/apps/claim-unfulfilled-export/server.mjs
PORT=4184 node fixtures/apps/keyboard-inaccessible/server.mjs
```

Then audit it:

```bash
node dist/src/cli/main.js audit --url http://127.0.0.1:4180
```

Or let Possum start it:

```bash
node dist/src/cli/main.js audit --command "PORT=4180 node fixtures/apps/beginner-dead-end/server.mjs" --url http://127.0.0.1:4180
```

Fixtures:

- `beginner-dead-end`: first screen has no links, buttons, or forms; should produce `finding_beginner_dead_end_001`.
- `impatient-double-submit`: form submits each rapid click; should produce `finding_impatient_double_submit_001`.
- `hostile-server-error`: unexpected input produces HTTP 500; should produce `finding_hostile_server_error_001`.
- `keyboard-inaccessible`: unnamed icon button and non-focusable custom control; should produce `finding_keyboard_missing_name_001`.
- `claim-unfulfilled-export`: advertises PDF export but offers no export control; with `models` configured should produce `finding_claim_unfulfilled_001`.
