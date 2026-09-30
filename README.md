# HT-MESH Panel

Web control panel for an HT-MESH (BLE Mesh) gateway. It shows gateway details and lets you control the nodes, groups and scenes that are already provisioned on the gateway.

The panel is **control-only**. Provisioning nodes and creating, renaming or deleting groups and scenes is done from the mobile app.

> **Status:** the UI runs on mock data from `src/data.js`. Gateway commands (Refresh, Restart, Factory Reset, Recall) are simulated and only show a toast. No gateway API is connected yet.

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
- **Nodes:** a card for each node with a power switch, online/offline state, device type and node ID. Selecting a node opens **Node Control**: a Control panel (left) and a Status panel (right) for that node. Offline nodes can be selected, but their controls are disabled.
- **Groups:** the same card layout and **Group Control** section. Commands go to the group address, and the Status panel lists the group's address, type and member nodes.
- **Scenes:** each scene with its number and registered nodes, and a **Recall** button.
- **Refresh** (top right): pulls the latest gateway, node, group and scene data into the view.

## Project structure

```
src/
├── App.jsx                  # Header, tabs, app state, gateway actions
├── data.js                  # Mock gateway, nodes, groups and scenes
├── index.css                # Design tokens (colours, fonts) and base styles
├── App.css                  # Component styles
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
        └── hsl.js           # 16-bit HSL <-> degrees/percent helpers
```

## Data model

All state lives in `App.jsx`, starting from the mock data in `src/data.js`.

- **Node:** `id`, `name`, `type`, `product`, `mac`, `online`, plus the device state (for a light: `on`, `mode`, `brightness`, `cct`, `hsl`).
- **Group:** `id`, `name`, `address` (from `0xC001`), `type`, `members` (node ids), plus the same device state.
- **Scene:** `id`, `name`, `number`, `members` (node ids).

HSL values are stored as BLE Mesh 16-bit values (0–65535) and shown in the UI as degrees and percent. Setting brightness or CCT puts a light in `cct` mode. Setting hue, saturation or lightness puts it in `hsl` mode.

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
3. Give nodes or groups `type: 'blind'` in the data.

Nothing else needs to change. If a type isn't registered, its Control panel says there is no control UI yet, and its Status panel still shows the basic details.

## Connecting a real gateway

Replace these with API calls:

- the initial state in `src/data.js`
- `refresh` and `runGatewayAction` in `src/App.jsx`
- `updateNode` and `updateGroup` in `src/App.jsx`, which receive `(id, patch)` from the controls
- the Recall handler in `src/components/ScenesTab.jsx`
