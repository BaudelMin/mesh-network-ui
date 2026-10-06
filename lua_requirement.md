# HT-Mesh Lua driver — requirements for the panel

This is what the Control4 Lua driver must implement so the HT-MESH panel (this repo) can show and control an HT-Mesh gateway. The panel is **control-only**: it never provisions, creates, renames or deletes anything.

Source of truth for the gateway protocol: *HTMesh Gateway API Reference* (xwiki, last modified 2026-09-23). Section names below refer to it.

## 1. Architecture

```
┌──────────────┐  broker.executeCommand     ┌──────────────┐  WebSocket JSON-RPC   ┌──────────────┐
│ HT-MESH panel│ ── SetDeviceState ───────▶ │  Lua driver  │ ────────────────────▶ │ HT-Mesh      │
│ (web tab JS) │                            │              │                       │ gateway      │
│              │ ◀───────────────────────── │              │ ◀──────────────────── │              │
└──────────────┘  C4 variables (JSON)       └──────────────┘  responses + .STATUS  └──────────────┘
                  live over Socket.IO                         pushes
```

- **Panel → driver:** one device command, `SetDeviceState`, with `tParams` `{ command, params, id, isGroup, isScene }`, for every request (§3). It reaches the driver as `ExecuteCommand("SetDeviceState", tParams)` → `EX_CMD.SetDeviceState`. That includes `Gateway.SYNC`, which asks the driver to rewrite every data variable (§3a). The full format is in [`docs/set-device-state.md`](docs/set-device-state.md).
- **Driver → panel:** four C4 variables holding JSON strings (`Information`, `Nodes`, `Groups`, `Scenes`). There is no status variable: command outcomes are only logged by the driver (`[PANEL]` lines). Through broker.js the panel subscribes to the variables live, re-subscribes after every reconnect, and also re-reads them every 10 s while the tab is visible. The live push only speeds updates up: even with a dead socket the tab is at most 10 s behind the variables.
- **Units:** the panel always sends and expects **panel ranges**. The driver converts to and from wire ranges (§5).

## 2. Driver setup

### Properties (driver.xml)

| Property       | Type   | Default | Notes                                  |
| -------------- | ------ | ------- | -------------------------------------- |
| `Gateway IP`   | STRING | (empty) | Gateway IP address or hostname         |
| `Gateway Port` | STRING | `80`    | WebSocket port                         |

The WebSocket URI is `ws://<Gateway IP>:<Gateway Port>/rpc/wss`. Reconnect whenever either property changes.

### Web tab

- Build the panel with `npm run build`, and copy the contents of `dist/` into the driver's `www/` folder.
- Declare it as a tab, e.g. `<tab name="HT-Mesh" file="www/index.html"/>`.
- The build uses relative asset paths (`base: './'`), so it works from any folder.
- Director must open the tab with `apihost`, `driverid` and `apitoken` in the query string. Without them the panel shows **Offline**, with no data and every command disabled.

### Variables (created in Lua, e.g. `ON_DRIVER_INIT`)

```lua
C4:AddVariable("Information",    "{}", "STRING")
C4:AddVariable("Nodes",          "[]", "STRING")
C4:AddVariable("Groups",         "[]", "STRING")
C4:AddVariable("Scenes",         "[]", "STRING")
```

The names must match exactly (`src/api/client.js` → `VARIABLES`). Every value is a JSON string; the shapes are in §6.

No driver.xml `<actions>` are needed. The panel sends every request with `broker.executeCommand('SetDeviceState', tParams)`, which goes straight to `ExecuteCommand` and is dispatched to `EX_CMD.SetDeviceState` (handler in [`docs/set-device-state.md`](docs/set-device-state.md) §6). Declaring it under driver.xml `<commands>` is optional, and only needed to expose it to Composer programming.

### Empty values

When there is no data for a variable, the driver must still write it, using the empty value:

| Variable         | Empty value |
| ---------------- | ----------- |
| `Information`    | `{}`        |
| `Nodes`          | `[]`        |
| `Groups`         | `[]`        |
| `Scenes`         | `[]`        |

Examples: the gateway isn't connected, has no nodes or groups yet, or a query failed. The panel treats an empty value, an empty string, or invalid JSON as "no data", and shows "No gateway data available", "No nodes provisioned yet", and so on. Never leave stale data in a variable after the gateway reports that data is gone.

Lists may be written either as a JSON array or as the index-keyed object `C4:JsonEncode` produces for a Lua array (`{"1":{…},"2":{…}}`, and `{}` when empty). The panel accepts both, for the variables and for each entry's `nodes`.

## 3. Command entry point: `EX_CMD.SetDeviceState`

The panel calls:

```js
broker.executeCommand('SetDeviceState', {
  command: 'Node.HSL',                                                    // API <Target>.<Operation>
  params:  '{"node_id":"6abc…","hue":120,"saturation":100,"lightness":50}', // JSON string, panel ranges
  id:      '6abc…',                                                       // node / group / scene id, or ""
  isGroup: false,
  isScene: false,
})
```

Fields, per-command values, examples and a JSON Schema: [`docs/set-device-state.md`](docs/set-device-state.md).

The driver must:

1. Handle `EX_CMD.SetDeviceState(tParams)`, JSON-decode `tParams.params`, and check that `id`, `isGroup` and `isScene` match it (they arrive as strings). Route `Gateway.SYNC` to §3a; everything else continues below.
2. Reject any `command` not in the allowlist (§4), and log it (§8).
3. Convert values to wire ranges (§5).
4. Wrap the result in the wire request and queue it (§7):

   ```json
   { "id": "<request id>", "call": "/rpc/<command>", "data": { …converted params… } }
   ```
5. Remember `id → { command, target }` so the immediate response can be matched to it.

The panel already validates required params and ranges (`src/api/commands.js`), but the driver should validate again before sending.

## 3a. Data sync: `Gateway.SYNC`

The panel calls:

```js
broker.executeCommand('SetDeviceState', { command: 'Gateway.SYNC', params: '{}', id: '', isGroup: false, isScene: false })
```

`Gateway.SYNC` is handled by the driver and never forwarded to the gateway.

It does this at two times:

- **On page load:** once all content has loaded, the panel waits **3 seconds** so the driver can establish its gateway connection, then sends `Gateway.SYNC`. Until then its header shows *Connecting…*.
- **On Refresh:** every press of the top-right **Refresh** button sends it again.

Once `ExecuteCommand` returns, the panel re-reads the four variables and shows "Refresh requested". There is no completion signal: each variable the driver rewrites as the gateway answers reaches the panel over the live feed (or the next 10 s re-read) and updates the view by itself.

The driver must, on `Gateway.SYNC`:

1. **If the gateway WebSocket is connected**, queue the full data refresh (the same requests as the startup sync in §9, steps 2–6 plus 8):
   - `Gateway.INFO` and `Gateway.STATUS` → `Information`
   - `Gateway.NODES` (plus `Node.STATE` for alive nodes) → `Nodes`
   - `Gateway.GROUPS` → `Groups`
   - `Gateway.SCENES` → `Scenes`
2. **When each part completes, write its variable, even if the content is unchanged.** Write the empty value (§2) if the gateway returned nothing, or if the request failed.
3. **If the gateway is not connected**, immediately write the empty value to `Information`, `Nodes`, `Groups` and `Scenes`. Then start a reconnect (§9).
4. Return from `ExecuteCommand` right away. Don't block on gateway responses; the panel picks up the results from the variables.
5. If several `Gateway.SYNC` calls arrive while a sync is running, merge them into one. Don't queue duplicate `Gateway.*` reads.

## 4. Commands the panel sends

Params are listed as the panel sends them, in panel ranges. `fadetime` (ms, optional) is part of the spec, but the panel doesn't send it today.

| `command`          | Required params (panel)                         | Wire `data` after conversion                 | When the panel sends it                     |
| ------------------ | ----------------------------------------------- | -------------------------------------------- | ------------------------------------------- |
| `Gateway.SYNC`     | —                                               | not forwarded (driver-local, §3a)            | 3 s after load, and Refresh                 |
| `Gateway.RESTART`  | — (optional `reset: "factory"`)                 | same                                         | Restart / Factory Reset buttons             |
| `Node.ONOFF`       | `node_id`, `onoff` (0/1)                        | same                                         | Power toggle / On-Off buttons               |
| `Node.BRIGHTNESS`  | `node_id`, `brightness` (0–100)                 | same                                         | Brightness slider (mode 1 nodes)            |
| `Node.CCT`         | `node_id`, `cct` (2700–6500 K)                  | same                                         | CCT slider (mode 2 nodes)                   |
| `Node.HSL`         | `node_id`, `hue` (0–360), `saturation` (0–100), `lightness` (0–100) | `hue`, `saturation`, `lightness` in 0–65535 | Hue/Saturation/Lightness sliders (all three always sent) |
| `Node.STATE`       | `nodes` (array of 1–16 node ids)                | same                                         | A node is selected in the Nodes tab         |
| `Group.ONOFF`      | `group_id`, `onoff` (0/1)                       | same                                         | Group power                                 |
| `Group.BRIGHTNESS` | `group_id`, `brightness` (0–100)                | same                                         | Group brightness slider                     |
| `Group.CCT`        | `group_id`, `cct` (2700–6500 K)                 | same                                         | Group CCT slider                            |
| `Group.HSL`        | `group_id`, `hue` (0–360), `saturation` (0–100), `lightness` (0–100) | 0–65535 each               | Group Hue/Saturation/Lightness sliders      |
| `Scene.RECALL`     | `scene_id`                                      | same                                         | Recall button                               |

Timing: slider commands are debounced to one every 250 ms per command and target. Power toggles are sent immediately.

## 5. Range conversion

| Field                    | Panel range | Wire range | Panel → wire                  | Wire → panel                  |
| ------------------------ | ----------- | ---------- | ----------------------------- | ----------------------------- |
| `hue`                    | 0–360 °     | 0–65535    | `round(hue * 65535 / 360)`    | `round(hue * 360 / 65535)`    |
| `saturation`             | 0–100 %     | 0–65535    | `round(s * 65535 / 100)`      | `round(s * 100 / 65535)`      |
| `lightness`              | 0–100 %     | 0–65535    | `round(l * 65535 / 100)`      | `round(l * 100 / 65535)`      |
| `brightness`, `master_brightness`, `cct_brightness` | 0–100 % | 0–100 % | unchanged | unchanged |
| `cct`                    | 2700–6500 K | Kelvin     | unchanged                     | unchanged                     |
| `onoff`                  | 0/1         | 0/1        | unchanged                     | unchanged                     |

Clamp after converting. Apply wire → panel to **every** HSL value before writing it to `Nodes` or `Groups`: `Node.STATE.STATUS`, `Node.INFO.STATUS`, `Node.HSL.STATUS`, `Group.HSL.STATUS`.

## 6. Variables (driver → panel)

All values are JSON strings. Only the fields listed here are read by the panel (`src/api/adapters.js`); anything else is ignored.

### `Information`

`{ "info": <Gateway.INFO result>, "status": <Gateway.STATUS result> }`. Both are stored exactly as the gateway returns them, with no conversion.

```json
{
  "info": {
    "gateway_id": "HYP-GW-HT-CDE15C", "name": "HYP-GW-HT_C4_0E_04", "product_id": "HYP-GW-HT",
    "manufacturer": "Hypnotik", "mac": "3C:0F:02:C4:0E:06", "chip": "esp32s3", "os": "FreeRTOS-V10.5.1",
    "fw_version": "v1.0.1", "commit_hash": "c007629", "hw_version": "v1.0.0", "serial": "1",
    "date_of_manufacture": "", "gw_provisioned": true, "bleEnabled": true,
    "network": {
      "wifi": { "ssid": "MyNetwork", "connected": true, "ip": "192.168.0.199" },
      "ethernet": { "connected": true, "ip": "192.168.1.149" },
      "discovery_method": { "mdns": { "hostname": "HYP-GW-HT_C4_0E_04" } }
    },
    "location": { "region": "Kathmandu/Nepal", "timezone": "+0545", "latitude": 27.7172, "longitude": 85.324, "address": "Kathmandu" }
  },
  "status": {
    "gw_provisioned": true, "bleEnabled": true, "uptime": 195645000000,
    "memory": { "free_heap": 208164, "free_iram": 102400, "free_psram": 3145728 }
  }
}
```

The header shows `info.gateway_id`, falling back to `info.name`. `status.uptime` stays in **microseconds**; the panel formats it.

Update it on every `Gateway.INFO` response, and on every `Gateway.STATUS` response or 30 s auto-push. Update `wifi` from `Gateway.NETWORK.STATUS` pushes too.

### `Nodes`

This is an array with one entry per registered node. The driver builds it by merging several API sources:

```json
[
  {
    "id": "6abcce2d9adef049cc886b53",
    "name": "HYP-LT-HT-C184EA",
    "mac": "10:b4:1d:c1:84:ea",
    "product_id": "HYP-LT-HT",
    "dev_type": "light",
    "is_alive": true,
    "mode": 2,
    "state": { "onoff": 1, "hue": 120, "saturation": 100, "lightness": 50, "cct": 4000, "cct_brightness": 80 }
  }
]
```

| Field        | Source                                                    | Notes |
| ------------ | --------------------------------------------------------- | ----- |
| `id`, `name`, `product_id`, `is_alive` | `Gateway.NODES`                  | `is_alive` drives the Online/Offline display and disables controls |
| `mac`, `dev_type`, `mode` | `Node.INFO.STATUS` (`Node.REFRESH.STATUS` has `mac` and `dev_type` too) | `dev_type` picks the control UI. Default to `"light"` if unknown |
| `state`      | `Node.INFO.STATUS`, `Node.STATE.STATUS`, and the `state` in every `Node.*.STATUS` control push | **Panel ranges** (§5). Merge partial updates into the existing state |

**The `state` fields depend on the node's mode.** Only include fields the node reports for its mode, and never pad missing fields with 0. The panel shows and hides controls and status rows based on which fields are present:

| `mode` | Fields in `state`                                                                  | Controls shown |
| ------ | ---------------------------------------------------------------------------------- | -------------- |
| 1      | `onoff`, `brightness`, `master_brightness`                                         | Power, Brightness |
| 2      | `onoff`, `hue`, `saturation`, `lightness`, `cct`, `cct_brightness` (+ `master_brightness` if set) | Power, CCT, Hue, Saturation, Lightness |
| absent | whatever is known                                                                  | all |

### `Groups`

```json
[
  {
    "group_id": "living-room",
    "group_name": "Living Room",
    "group_addr": 49153,
    "type": "light",
    "nodes": ["6abcce2d9adef049cc886b53", "6abcce2d9adef049cc886b54"],
    "state": { "onoff": 1, "brightness": 80, "cct": 4000, "hue": 0, "saturation": 0, "lightness": 50 }
  }
]
```

- `group_id`, `group_name` and `nodes` come from `Gateway.GROUPS`.
- `group_addr` is optional: `Gateway.GROUPS` doesn't return it, and the panel shows `—` without it.
- `type` defaults to `"light"`.
- `state` is **maintained by the driver** from the last commanded values in `Group.ONOFF/BRIGHTNESS/CCT/HSL.STATUS` pushes, in panel ranges. The gateway doesn't track group state, and group commands are unacknowledged, so this reflects what was commanded, not what was confirmed. Persist it with `PersistSetValue` so it survives a driver restart.

### `Scenes`

```json
[
  { "scene_id": "movie-night", "scene_name": "Movie Night", "scene_number": 1, "nodes": ["6abcce2d9adef049cc886b53"] }
]
```

This comes straight from `Gateway.SCENES`. `scene_number` is optional, and `Scene.INFO` can fill it in if missing.

### No status variable

The driver keeps no `Command Status` variable. Command outcomes and rejected commands are logged by the driver (`[PANEL]` lines in the Lua trace); the panel sees their effect through the data variables.

## 7. Sending: queue and concurrency

The gateway rejects overlapping mesh operations with `0x9618` (*Operation already in progress*). The driver must therefore **serialize** gateway requests:

1. Keep a FIFO queue. Send one request, then wait before sending the next:
   - **Synchronous calls** (`Gateway.INFO/STATUS/NODES/GROUPS/SCENES`, `Scene.INFO`): wait for the RPC response (matched by `id`).
   - **Async node calls** (`Node.ONOFF/BRIGHTNESS/CCT/HSL/STATE/INFO`, `Scene.RECALL`): the immediate response carries `code 38430 (0x961E)`, meaning dispatched. Wait for the matching **final** `.STATUS` push, or a timeout of about 10 s.
   - **Group calls** (`Group.*`): the `.STATUS` push follows immediately after the local send, so waiting for it is cheap.
2. If the immediate response is `0x9618`, re-queue the request at the front and retry after about 500 ms, up to 3 times.
3. **Coalesce while queued:** if a newer `Node.HSL` for the same node arrives while an older one is still waiting in the queue, replace the older one. The same applies to every control command. This keeps slider drags from piling up.
4. Pushes have `"id": null`. Match them to the request in flight by `call` (`<command>.STATUS`) plus `result.node_id` / `result.group_id` / `result.id`.

How to recognise the final push for each command:

| Push                   | Intermediate (keep waiting)                        | Final                                                       |
| ---------------------- | -------------------------------------------------- | ----------------------------------------------------------- |
| `Node.<CTRL>.STATUS`   | `code 38422`, message `ble mesh: response timeout` | `code 0`, or `code 38422` with message `ble mesh: operation failed` |
| `Node.STATE.STATUS`    | `code 1` (one node done or skipped)                | `code 0` (`result.nodes[]`), or `38422` fatal              |
| `Node.INFO.STATUS`     | `Node.INFO.PROP` pushes                            | any `Node.INFO.STATUS`                                      |
| `Group.<CTRL>.STATUS`  | —                                                  | first push, always `code 0`                                 |
| `Scene.RECALL.STATUS`  | —                                                  | first push                                                  |

`Gateway.RESTART` sends no response at all. Log it as sent, expect the WebSocket to drop, and reconnect (§9).

## 8. Handling responses and pushes

| Message                                    | Driver action |
| ------------------------------------------ | ------------- |
| Immediate response, `code` 0 or 38430      | Nothing for the user yet; keep waiting (§7) |
| Immediate response, any other `code`       | Log that `code`/`message`, dequeue |
| `Node.ONOFF/BRIGHTNESS/CCT/HSL.STATUS`, code 0 | Merge `result.state` (converted, §5) into that node in `Nodes` |
| same, final failure                        | Log the failure. On the next poll, `Node.STATE` that node to restore its true state |
| `Node.STATE.STATUS` code 1 / final code 0  | Merge each node's `state`. If `reachable: false`, set that node's `is_alive = false` |
| `Node.INFO.STATUS`                         | Update `mac`, `dev_type`, `mode` and `state` for that node |
| `Group.<CTRL>.STATUS`                      | Merge `result.state` into that group's `state` in `Groups`, then queue `Node.STATE` for the group's `nodes` (the gateway marks their cache stale) |
| `Scene.RECALL.STATUS`                      | Queue `Node.STATE` for the scene's `nodes` |
| `Gateway.STATUS` (response or 30 s push)   | Update `Information.status` |
| `Gateway.NETWORK.STATUS`                   | Update `Information.info.network.wifi` |
| `Gateway.REMOVE.STATUS` (removed: true)    | Remove that node from `Nodes` (a removal done from the mobile app) |

Outside `Gateway.SYNC`, write a variable only when its content changes, so the panel doesn't re-render for nothing. During a sync, always write every variable (§3a).

Useful error codes to put in `message` (full table in the API reference):

| Code  | Hex    | Meaning |
| ----- | ------ | ------- |
| 0     | 0x0000 | success |
| 38401 | 0x9601 | invalid parameters |
| 38402 | 0x9602 | invalid state / not started / not found (groups, scenes) |
| 38413 | 0x960D | node not found |
| 38422 | 0x9616 | BLE mesh operation failed / timeout |
| 38424 | 0x9618 | operation already in progress |
| 38430 | 0x961E | accepted, pending confirmation |

## 9. Sync: startup, reconnect and polling

**On WebSocket connect** (and after every reconnect), queue:

1. `Gateway.START` (`{}`). All Node/Group/Scene APIs need it. `0x9602` means it's already running, which is fine.
2. `Gateway.INFO` → `Information.info`
3. `Gateway.STATUS` → `Information.status`
4. `Gateway.NODES` → base entries in `Nodes`. Drop nodes that are no longer listed.
5. `Gateway.GROUPS` → `Groups`, keeping persisted `state` for groups that still exist
6. `Gateway.SCENES` → `Scenes`
7. `Node.INFO` for each node whose `mac`, `dev_type` or `mode` is still unknown, one at a time. This is slow, since it fetches 10 properties per node.
8. `Node.STATE` for alive nodes, in batches of up to 16

**Polling.** Nodes do **not** push their own state changes (a wall switch, for example), so poll:

| What             | Suggested interval | Why |
| ---------------- | ------------------ | --- |
| `Gateway.NODES`  | 30 s               | `is_alive` (online/offline), nodes added or removed by the mobile app |
| `Node.STATE`     | 60 s, alive nodes, batches of 16 | state changed outside the panel |
| `Gateway.GROUPS`, `Gateway.SCENES` | 5 min | membership edited in the mobile app |
| `Gateway.STATUS` | none               | auto-pushed every 30 s |

Polls go through the same queue, behind any user command.

**Reconnect** with backoff (for example 2 s, 5 s, 10 s, then every 30 s) after a disconnect: `Gateway.RESTART`, `Gateway.NETWORK`, a gateway OTA, or a network drop. While disconnected, set every node's `is_alive` to `false` in `Nodes`, so the panel disables their controls. A `Gateway.SYNC` received while disconnected writes empty values instead (§3a).

## 10. Checklist

- [ ] Properties `Gateway IP` and `Gateway Port`, with a WebSocket client to `ws://<ip>:<port>/rpc/wss`
- [ ] Variables `Information`, `Nodes`, `Groups`, `Scenes` created as STRING
- [ ] `EX_CMD.SetDeviceState(tParams)`: decode `params`, cross-check `id` / `isGroup` / `isScene`, check the allowlist (§4), convert (§5), queue
- [ ] `Gateway.SYNC` (via `SetDeviceState`): full refresh that always writes all four data variables, using empty values when there's no data (§3a)
- [ ] Request `id` counter and a pending-request table
- [ ] Serialized queue with the final-push detection in §7, a 0x9618 retry, and coalescing of control commands
- [ ] Wire → panel conversion on every HSL value written to variables
- [ ] Mode-aware `state` (only the fields reported for that mode)
- [ ] Group state maintained from `Group.*.STATUS` and persisted
- [ ] `Node.STATE` follow-ups after group commands and scene recall
- [ ] Startup sync, polling, reconnect with backoff, `is_alive = false` while disconnected
- [ ] `[PANEL]` log line for every final outcome and every rejected command
- [ ] `dist/` copied into `www/`, and the tab declared in driver.xml
