# Possum Fixture Apps

These apps are intentionally broken local targets for checking Possum findings.

Run any fixture directly:

```bash
PORT=4180 node fixtures/apps/beginner-dead-end/server.mjs
PORT=4181 node fixtures/apps/impatient-double-submit/server.mjs
PORT=4182 node fixtures/apps/hostile-server-error/server.mjs
```

Then audit it:

```bash
node dist/src/cli/main.js audit --url http://127.0.0.1:4180
```

Fixtures:

- `beginner-dead-end`: first screen has no links, buttons, or forms; should produce `finding_beginner_dead_end_001`.
- `impatient-double-submit`: form submits each rapid click; should produce `finding_impatient_double_submit_001`.
- `hostile-server-error`: unexpected input produces HTTP 500; should produce `finding_hostile_server_error_001`.
