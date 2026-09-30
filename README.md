# HT-MESH Panel

Web control panel for an HT-MESH (BLE Mesh) gateway. It shows gateway details and lets you control the nodes, groups and scenes that are already provisioned on the gateway.

The panel is **control-only**. Provisioning nodes and creating, renaming or deleting groups and scenes is done from the mobile app.

The panel runs as a Control4 Composer web tab. It talks to the HT-Mesh Lua driver through the Director broker (`src/api/broker.js`), and the driver talks to the gateway. What the driver must implement is specified in [lua_requirement.md](lua_requirement.md).

Opened outside Director (for example with `npm run dev`), the panel shows mock data from `src/data.js`, marks the header **Mock data**, and logs every command to the browser console instead of sending it.

Built with React 19 and Vite 8, linted with Oxlint.

## Getting started

Requires Node.js 20.19+ or 22.12+ (Vite's minimum).

```bash
npm install
npm run dev       # dev server at http://localhost:5173
```

| Script            | What it does                          |
| ----------------- | ------------------------------------- |
| `npm run dev`     | Start the dev server with hot reload  |
| `npm run build`   | Production build into `dist/`         |
| `npm run preview` | Serve the production build locally    |
| `npm run lint`    | Lint with Oxlint                      |

The active tab is kept in the URL hash, so you can link straight to a tab: `#info`, `#nodes`, `#groups`, `#scenes`.

## Features

- **Information:** gateway identity, runtime status, network and location (read-only), plus Restart (soft) and Factory Reset. Both ask for confirmation.
- **Nodes:** a card for each node with a power switch, online/offline state, device type and node ID. Selecting a node opens **Node Control**: a Control panel (left) and a Status panel (right) for that node, and asks the driver for the node's live state. Offline nodes can be selected, but their controls are disabled. Controls follow the light's mode: mode 1 lights get Power and Brightness, mode 2 lights get Power, CCT, Hue, Saturation and Lightness.
- **Groups:** the same card layout and **Group Control** section. Commands go to the group address, and the Status panel lists the group's address, type and member nodes.
- **Scenes:** each scene with its number and registered nodes, and a **Recall** button.
- **Refresh** (top right): re-reads the driver's variables. They also update live without it.

## Project structure

```
src/
├── App.jsx                  # Header, tabs, selection, gateway actions
├── data.js                  # Mock driver variables (used outside Director)
├── index.css                # Design tokens (colours, fonts) and base styles
├── App.css                  # Component styles
├── api/
│   ├── broker.js            # Director REST + Socket.IO client (vendored, unchanged)
│   ├── client.js            # Sends HTMESH_RPC commands, reads driver variables; mock fallback
│   ├── commands.js          # Command specs: required params and ranges per API command
│   ├── adapters.js          # Driver variables -> UI state
│   └── useGateway.js        # React hook: state, optimistic updates, debounced sends
├── components/
│   ├── InfoTab.jsx
│   ├── NodesTab.jsx
│   ├── GroupsTab.jsx
│   ├── ScenesTab.jsx
│   ├── ControlSection.jsx   # Shared Control | Status section for a node or group
│   ├── EntityCard.jsx       # Shared node/group card with power switch
│   ├── ui.jsx               # Card, ReadOnly, OnOff, Chip
│   └── icons.jsx            # Inline SVG icons
└── devices/
    ├── index.js             # Device type registry
    └── light/
        ├── LightControl.jsx # Power, brightness, CCT, hue, saturation, lightness
        ├── lightStatus.js   # Status rows for a light
        └── hsl.js           # CSS colour helper
```

## How it talks to the gateway

```
panel  --executeCommand('HTMESH_RPC', { command, params })-->  Lua driver  --WebSocket RPC-->  gateway
panel  <--variables: Information, Nodes, Groups, Scenes, Command Status--  Lua driver
```

- **Commands:** every command is `{ command, params }`, for example `{ command: 'Node.CCT', params: { node_id, cct } }`. `src/api/commands.js` lists the commands the panel sends, with the required params and allowed ranges from the HTMesh Gateway API Reference. It rejects invalid values before anything is sent.
- **Ranges:** the panel uses its own ranges: hue 0–360°, saturation and lightness 0–100%, brightness 0–100%, CCT in kelvin. The Lua driver converts HSL to and from the gateway's 0–65535.
- **State:** the panel updates the UI as soon as you change a control, then takes the next variable update from the driver as the real state. Slider commands are debounced (250 ms), and power toggles are sent immediately.
- **Feedback:** `Command Status` updates from the driver appear as toasts.

## Data model

UI state comes from the driver variables through `src/api/adapters.js`:

- **Node:** `id`, `name`, `type`, `product`, `mac`, `online`, `mode` (1 or 2), plus the light state: `on`, `brightness`, `masterBrightness`, `cct`, `cctBrightness`, `hsl` `{ h, s, l }`. A field the node doesn't report for its mode stays undefined and is hidden.
- **Group:** `id`, `name`, `address`, `type`, `members` (node ids), plus the same light state.
- **Scene:** `id`, `name`, `number`, `members` (node ids).

## Adding a device type

Node Control and Group Control choose their UI from the device registry, using the node's or group's `type`. To add a type such as blinds:

1. Create `src/devices/blind/` with:
   - a **Control** component: `({ state, disabled, onChange }) => JSX`. Call `onChange(patch)` with the fields that changed.
   - a **status** function: `(state) => [{ label, value, swatch? }]`
2. Register it in `src/devices/index.js`:

   ```js
   export const DEVICE_TYPES = {
     light: { label: 'Light', Control: LightControl, status: lightStatus },
     blind: { label: 'Blind', Control: BlindControl, status: blindStatus },
   }
   ```
3. Add its commands to `COMMAND_SPECS` in `src/api/commands.js`, plus a helper like `lightRequests` that turns a control patch into requests. Then call it from `control()` in `src/api/useGateway.js`, based on the node's type.
4. Have the Lua driver report `dev_type: 'blind'` for those nodes (see lua_requirement.md).

If a type isn't registered, its Control panel says there is no control UI yet, and its Status panel still shows the basic details.

## Deploying to Control4

1. Run `npm run build`.
2. Copy the contents of `dist/` into the Lua driver's `www/` folder.
3. Declare the tab in driver.xml, for example `<tab name="HT-Mesh" file="www/index.html"/>`.

Director opens the tab with `apihost`, `driverid` and `apitoken` in the URL. The broker needs these to connect.
