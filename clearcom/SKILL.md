---
name: Clear-Com (CC) System and Component Guide
description: Clear-Com product/system architecture and debugging guide covering EHX/CPUApp, IVCore/DPI/IVP, PlutoApp, Iris/VSeries, Ares/Mentrix/UserIO, Arcadia, LQ, HelixNet, virtual clients and MMID/CCM.
---
# Clear-Com system guide

Clear-Com (CC) makes real-time audio communication systems. Classify components as:

- **Endpoints/clients:** panels or software that users speak into, listen to and operate through headsets, speakers and keys.
- **Matrices:** system servers. They authenticate/control clients and own audio/signal routing.
- **Configuration/management surfaces:**
  - **Endpoint managers:** device-local CCM web pages.
  - **Matrix managers:** CCM web pages, local or cloud-hosted, for LQ/Skyport/Gen-IC.
  - **EHX:** standalone Windows administration/configuration software for Eclipse endpoints and matrices.

## 1. Architecture invariants and configuration planes

For a physical Eclipse HX deployment, the normal path is:

```text
EHX desired map/configuration
  -> map, firmware or HCI transfer
  -> CPUApp on the Eclipse Config Card/matrix
  -> CPUApp live panels, entities, routes and hardware state
  -> IVCore/IVP/DPI over the network
  -> endpoint PlutoApp
       -> CANBUS -> Iris/VSeries display modules
       -> UserIO JSON/ZMQ -> Ares/Mentrix display services
```

Keep these facts separate:

- **EHX vs. CPUApp:** EHX creates the desired Eclipse configuration. CPUApp validates/loads the downloaded map, creates live records and owns runtime matrix state. A map is not the same as current live state. EHX firmware/HCI transfer and map transfer are separate events.
- **Matrix vs. endpoint authority:** CPUApp is authoritative for matrix labels, roles, crosspoints, key configuration and state. An endpoint reports input/state through IVCore and renders the CPUApp result; PlutoApp translates the CPUApp representation into the endpoint transport. An Ares keyset or display coordinate is not a CPU address.
- **CCM/MMID is a second management plane:** a browser CCM page calls the MMID Node/Express service through REST and WebSocket/Socket.IO. MMID owns the local configuration database and system operations, then talks to backend applications over ZMQ. Do not call a CCM REST update an EHX-map update unless a documented bridge exists.
- **CCM/MMID alongside runtime:** Ares/Mentrix and VSeries/Iris images include CCM/MMID. Iris production uses CCM to set panel IP; the Ares production package uses CCM REST for hardware information, logs and tests. These are device setup/monitoring/control surfaces, not an EHX map editor.
- **CPUApp's MMID model:** `MMID_PORT` is `200`; `PANEL_TYPE_VSERIES_MMID` is `Terminator Web Server`; `ConfigureMMID()` sends `ECS_HCI_MANAGEMENT_INTERFACE_ONLINE` and special CCM call keys; `associatedPanelId` links a real endpoint to the numeric MMID device ID. Thus MMID/CCM can appear in CPUApp panel/entity/DPI code without a physical panel being added.
- **Pluto/MMID online timing:** PlutoApp starts ZMQ without an online event, waits for its original EHX configuration before starting DSP, then calls `ZmqConfigHandler::SendDeferredOnlineEvent()` to publish the deferred MMID online event. This is a service handshake, not the EHX map.

For Neptune/Atlas and other virtualized deployments, trace this alternative path instead:

```text
CCM -> MMID REST/Socket.IO -> ZMQ -> NeptuneApp or Umbra
     -> HCI/ADM -> DpiServer/CPUApp -> IVCore/endpoint paths
```

`umbra` is the interface between virtual Eclipse (`DpiServer`/`CPUApp`) and MMID. It translates MMID requests to HCI/DPI rather than making the web service own another CPUApp state copy. Verify the deployment before assuming a CCM request goes directly to a physical PlutoApp.

### Configuration-plane failure classification

Classify the first failed boundary before changing code:

1. **EHX/map:** desired map, role/key data or firmware was not generated/transferred.
2. **CPUApp live state:** map loading, endpoint/entity state or domain-owner validation failed.
3. **IVCore/IVP/DPI:** network session, control/data packet or media path failed.
4. **PlutoApp endpoint transport:** CANBUS, UserIO/ZMQ, coordinate conversion or display service failed.
5. **MMID/CCM:** REST/auth/database/ZMQ/HCI bridge or browser status update failed.

Useful anchors: `CPUApp/Map/Entities.cpp`, `CPUApp/comms.h`, `CPUApp/LiveUpdateManager.cpp`, `CPUApp/dpi.h`, `CPUApp/dpi.c`, `firmware/applications/common/Virtualization/Eclipse/json/JSONToCPUAppLib.cpp`, `firmware/applications/PlutoApp/src/core/PlutoApp.cpp`, `firmware/applications/common/mdp/zmq-config-handlers.cpp`, `firmware/c4-models/neptune/mmid_docs/config.md`, `firmware/web/server/init.ts`, `ccm_ui/README.md`, `firmware/production/iris/README-IRIS-production-tests.md`, `firmware/production/ares/README-ARES-apis.md` and `firmware/applications/umbra/README.md`.

## 2. Product boundaries

Use product names as architecture hints, not proof that every product uses the physical Eclipse CPUApp path:

| Family/component | Boundary and debugging rule |
|---|---|
| **Eclipse HX** | Digital matrix/control plane. EHX is the Windows configuration software; CPUApp is embedded matrix runtime/Config Card software. |
| **IrisX/Iris and Ares/Mentrix** | Endpoint/user-station families sharing PlutoApp here: Iris/VSeries uses CANBUS; Ares/Mentrix uses UserIO/ZMQ. Both expose local CCM/MMID. |
| **Arcadia** | Central-station/IP intercom platform that can host/interoperate with V-Series, FreeSpeak, HelixNet and IP/analog interfaces. Do not assume an Eclipse CPUApp map path. |
| **LQ** | IP interface/bridge family. Start at IVP/IVR, IClient, presence, REST/MMID and network-interface code—not physical panel CANBUS/UserIO. |
| **HelixNet** | Wired digital partyline. Follow its endpoint/IVR/IClient and matrix adapters; a station is not automatically an Eclipse RPK panel. |
| **Agent-IC, Station-IC, Gen-IC** | Virtual/mobile/desktop clients, not physical VSeries/Ares firmware. Trace IClient/IVP, audio, presence, authentication and the host matrix or LQ/E-IPA/IVC-32 connection. |
| **E-IPA, IVC-32, E-QUE and related cards** | Matrix-side interface/gateway boundaries that may carry IVCore/IVP audio/data. They are not interchangeable with CPUApp, PlutoApp or a panel display service. |

## 3. Shared IVCore, IVP and DPI

All CC families use shared IVCore code, including Eclipse, LQ, virtual clients and physical panels. IVCore's **DPI (Dumb Panel Interface)** is common matrix/endpoint messaging, not an Ares- or Eclipse-only protocol.

DPI has two broad classes:

- **Media packets:** media path.
- **Data/control packets:** panel events, labels, indications and related signalling/state.

The product-specific endpoint transport follows DPI: PlutoApp presents it through CANBUS for Iris/VSeries or UserIO/ZMQ for Ares/Mentrix; other families have their own endpoint implementation.

### IVP/DPI stack and diagnostics

```text
IVP frame
  +-- full/control -> HDLC -> EQue or AOIP EQue -> DPI
  +-- media        -> RTP-like media payload
```

- With `ivrd`, a DPI client can open its normal CPUApp connection while `ivrd` intercepts the request and establishes that connection for the client. The IVP library is used by both `ivrd` and ExtCard paths.
- Packed definitions are related but layer-specific: IVCore=`ccstruct.h`, Eque=`dpi+ext.h`, CPUApp=`comms.h`. Interpret `port_msg_t` and `ind_data_t` for the correct layer/build; same names do not make packed structures interchangeable.
- Wireshark plugins expose `ivp`, `ivp_full`, `ivp_media`, `hdlc`, `eque`, `aoip_eque` and `dpi`. Full/control exposes DPI fields such as Unicode text; media exposes sequence/call/level fields and can pass audio payloads to RTP tools. IVP may be encrypted: the dissector can show unencrypted information before an encrypted payload but does not decrypt the stream.
- References: `ivcore/wireshark/README.md`, `firmware/c4-models/atlas/docs/ivcore.md`, `firmware/c4-models/neptune/docs/ivcore.md`.

### IVCore clients, audio, routing and model sync

- **IClient:** application-facing IVCore client. `IClientAudioManager` bridges IVCore media to external audio and is selected by configuration/factory code. Implementations include local-device, file/FIFO, Android, SIP/RTP and Moonraker/LinQ DSP variants. One AudioManager is supported per process; multiple IClient instances may share that process.
- **Routing/presence:** `IvRouting` routes audio packets and maintains endpoint presence/signalling. `IvPresence` supplies the logical presence model that determines destinations and inter-IVR links. Production may use the `kivr` kernel module; user-space media routing is also used for tests/debugging.
- **Spread Dispersion:** deployments using it synchronize model objects with JSON request, instance/update, full-data and delete messages: `KMT_REQUEST`, `KMT_INSTANCE`, `KMT_FULL_DATA`, `KMT_DELETE`. This model/presence synchronization is separate from binary DPI wire packets.

## 4. Eclipse HX and CPUApp

### Role, target and boot model

The Config Card/CPU Card runs CPUApp (normally `./CPUApp` in the main `cc-clearcom` repo or a worktree). CPUApp loads the EHX map, builds live cards/ports/panels/entities, controls matrix and audio hardware, handles panel/host events, publishes labels/indications/status and manages firmware, diagnostics and redundant CPUs. The CPU card normally controls audio-processing hardware; it does not process audio samples itself.

CPUApp legacy embedded code is C89: declare variables before executable statements in each block and observe other C89 restrictions. It is built on Windows with batch files and unit tests; added tests may require new stubs. The full devtest build covers Delta, Median and Pico, runs tests and builds the bootloader.

The original target is bare-metal PowerPC firmware for MPC8260/MPC8280 CPU cards: reset/exception assembly, direct hardware, MMU/cache/watchdog setup, flash/EEPROM and a cooperative task manager—not Linux, processes, threads or a general RTOS. Host/Linux `TERMINATOR`, `Virtualization/` and x86 unit-test forms also exist; shared domain code does not make hardware rules identical.

```text
ROM/bootloader -> AppLoader -> PowerPC reset/assembly -> sys_boot()
  -> sys_init() -> rack_init() -> taskman()
```

The embedded scheduler ticks every 25 ms. Tasks do bounded work, yield with `task_timeout()` and return `SIG_NULL`, `SIG_BUSY` or `SIG_QUIT` as appropriate. Do not put blocking/unbounded loops, large parsing, flash waits or long hardware operations in interrupts or high-priority tasks.

### CPUApp ownership and data rules

- **Desired vs. live:** the EHX map is desired configuration; live records are current fact. A configured card, panel or route may be absent, offline or pending.
- **Owner per state:** host/panel handlers request domain changes; domain owners update live state; hardware/transport applies and reports it. Do not fix a symptom by writing another component's global state directly.
- **Bidirectional feature contract:** cover configuration -> live state -> operation -> hardware and input/state change -> feedback/status -> panel/host, including reset, NID/map reload, reconnect and backup-CPU behavior.
- **Interface formats:** packed map, HCI, DPI, IPC, NVRAM and flash formats are compatibility interfaces. Preserve size, endianness, version, migration and compatibility rules; x86 `sizeof` does not prove PPC wire size.

### Map and lifecycle

Main source areas: `CPUApp/*.c`/`*.h` (legacy core), `CPUApp/AppComponents/` (newer domains/tests), `CPUApp/inc/` (shared APIs/types), `CPUApp/Virtualization/` (host/virtual hardware) and `CPUApp/docs/` (HCI/test docs). Detailed local guide: `~/work/COPILOT - CPU APP ARCHITECTURE_GUIDE.md`.

The EHX map is a packed binary database, not editable text. `MapConfig` selects/validates a bank; `cmap_setup()` copies the selected image to `live_map`, converts relative table offsets and populates `cmap_table`. Before reading, parsers must validate table pointers, `CCF_STRUSIZ` sizes, counts, offsets and `CCF_MULTIPLE` subtable lengths. Raw map pointers are valid only for the current map image.

`rack_init()` transforms the valid map plus detected hardware into live state in dependency order: cards/ports and audio slots -> directory/entities -> roles/endpoints -> panels/keys -> routes/IFB/conferences/linking -> task/transport services. A map change may be NID-applied or restart-required; do not assume a new field is NID-safe.

### Redundancy and persistence

With two CPU cards, the master controls the live matrix; the backup runs the `SlaveService` path and receives failover state through IPC. Classify new runtime state as **map data**, **replicated state**, **reconstructable master-only state** or **persistent data** before adding it.

NVRAM, EEPROM and flash have different owners/reset behavior. For persistent data define fresh-board defaults, red/black reset behavior, map/update behavior, invalid-data handling and backup synchronization. Flash operations are task-serviced state machines; do not block panel/network work on flash.

### Panel and HCI model

CPUApp's authoritative panel coordinate is **RPK = region, page, key**:

```text
Paneldata -> Regiondata -> Keydata

PIF receive -> dpi_process_msg() -> panel/key lookup
  -> DPF action/domain owner -> live state
  -> dpi_key_sig_update()/dpi_sig -> PIF output
```

`Paneldata` owns panel identity/type/layout/online state and regions. `Keydata` owns the configured key's entity, action, text, status and display state. Use panel layout and coordinate-conversion helpers: key numbers are not universal, and an Ares keyset is not an authoritative CPU address.

#### Common CPUApp-to-panel/display contract

CPUApp's RPK remains the authoritative identity from configuration through endpoint rendering. A panel renderer—`AresDisplayApp` on Ares, or the Pluto/CANBUS display layer on Iris/VSeries—must translate that identity for its hardware; it must not create a competing matrix key address:

```text
panel input/status -> DPI key event -> CPUApp RPK lookup -> configured action/domain owner
CPUApp text/indication/LED state -> DPI -> PlutoApp -> endpoint transport -> display renderer
```

Common DPI/key behavior:

- **Key actions/status:** an endpoint reports press/release/held/latch state with the key's panel/region/page/key context. CPUApp resolves the RPK and applies `Keydata` configuration. Action flags include talk-on-press (`talk_1`), talk-on-hold (`talk_H`), listen-on-press (`listen_1`), forced listen (`listen_X`) and, where the build supports it, auto-listen-with-talk and call/hold behavior. `DPIC_ACT`, `DPIC_SEL`, `DPIC_POT`, `DPIC_SET` and `DPIC_HLD` are domain callbacks for key action, selectability, pot movement and up/down/hold adjustments.
- **Common functions:** talk/primary, listen, call/call-signal, volume up/down and page/function keys are configured actions or associated controls, not universal physical key numbers. A volume pot/encoder and its level indication can be related to a key without changing the key's RPK.
- **Text:** `MSGID_KEY_TEXT` carries ordinary key text; `MSGID_VAR_KEY_UNICODE_TEXT` carries variable UTF-16 text. The latter includes a character count and is not NUL-terminated. Text may include talk/listen or alternate labels, so do not assume every label is one short string.
- **Indications/tallies:** `MSGID_IND_DATA` carries `ind_data_t` for an RPK: region, key, page, indication number, value, phase, one-shot behavior and `rate_id`. It drives talk tallies and other display state such as red/green/blue LED, level/VOX, selection, busy, call-waiting/call-active and call-signal indications. `ind_state_t` names matrix-side states such as `IND_KEY_ACT_*`, `IND_KEY_SEL_*`, `IND_KEY_CALL_WT`, `IND_KEY_CAL_SIG` and `IND_KEY_CALL_ACT`; not every panel implements every indication.
- **LEDs and rates:** `MSGID_LED_FLASH_RATE` sends `flash_rate_t` (`id`, `mark`, `space1`, `space2`) to define a flash pattern; `MSGID_IND_DATA` selects the rate for an indication. Common rate constants include `0=OFF`, `15=ON`, `INDICATION_TALLY=1` (1 Hz, 50:50) and `INDICATION_BUSY=10` (about 1.39 Hz, 1:8), with panel/build-specific rates also available. `SetLEDFlashParams` and `SetLedState` apply the result downstream; they do not own the matrix indication.
- **Diagnostics:** distinguish a missing label (`MSGID_KEY_TEXT`/Unicode), key-status input (`MSGID_KEY_STAT_UPDATE`), talk tally/indication (`MSGID_IND_DATA`) and LED timing (`MSGID_LED_FLASH_RATE`). The common definitions and callbacks are in `CPUApp/dpi.h`, `CPUApp/comms.h`, `CPUApp/dpf.c` and `CPUApp/service_pif.c`.

HCI/ADM follows the same ownership pattern: wire message -> validation/dispatch -> domain API -> live state -> reply plus later unsolicited status. Host handlers must not bypass the domain owner to call panel/hardware code directly.

### Build and test

Windows setup uses `CPUApp/build/toolchain`, `CPUApp/hxcpu.code-workspace` and `build/setup-and-build.ps1`.

```text
gnumake omegadbgrel OMEGA=1
gnumake unit_tests
gnumake run_tests
```

Use `embedded_clean` when changing target/source selection or linker-sensitive configuration. Host tests prove local logic and simulated boundaries, not PPC reset/MMU/cache behavior, real PIF/Ethernet/IPC/backplane timing, physical rendering or watchdog load. For a defect, trace `source -> policy -> live owner state -> task/service/transport -> visible result`, compare a working case and repair the first failed boundary.

## 5. PlutoApp, Iris/VSeries and Ares/Mentrix

Iris/VSeries and Ares/Mentrix use the same PlutoApp binary; the build selects the endpoint transport. Both retain common concepts—RPK coordinates, pages, keysets, online menus, function keys, pots and DPI feedback—but their transport/debugging paths differ.

| Endpoint build | Pluto transport | Downstream path | Ares UserIO/services? |
|---|---|---|---|
| **Iris/VSeries** | CANBUS | PlutoApp -> CANBUS -> Iris/VSeries display modules | No `UserIO`, `userio-proxy` or `Ares*App` services |
| **Ares/Mentrix** | UserIO JSON over ZMQ | PlutoApp -> `userio-proxy` -> Ares/Mentrix display/apps | Yes |

### Iris/VSeries

Iris is the VSeries panel family:

```text
CPUApp (Config Card) -> IVCore/DPI over IVP -> PlutoApp -> CANBUS -> Iris display modules
```

It does not use `UserIO`, `userio-proxy` or Ares services. It does share CPUApp concepts and much VSeries Pluto logic: RPK coordinates, pages, keysets, online menus, function keys, pots and DPI feedback. CPUApp's RPK remains authoritative; Pluto converts it to the VSeries/Iris CANBUS module/display/key representation. That CANBUS address is downstream and panel-specific—do not treat it as an Ares `module/keySet/key` or infer the CPU RPK from it. Start panel behavior in `CPUApp/vseries.c`, `CPUApp/dpc_ccom.h`, `CPUApp/dpi.c`, `CPUApp/dpf_aio.c` and the non-Ares PlutoApp panel/CANBUS code.

### Ares/Mentrix architecture and UserIO

Ares and Mentrix are synonymous names for this family of embedded-Linux panel endpoints. The panel is the user-facing endpoint; CPUApp remains on the separate Config Card and owns configuration, routing, labels, indications and panel state.

```text
CPUApp (Config Card) -> DPI/IVP -> Ares/Mentrix PlutoApp
  -> UserIO JSON/ZMQ -> userio-proxy -> Ares/Mentrix display/apps
```

Ares/Mentrix applications normally live in `/usr/bin` and communicate over ZMQ, generally through `UserIOProxyApp` (application name) / `userio-proxy` (service name). Shared definitions: `firmware/applications/common/UserIO/UserIODefs.h`.

PlutoApp translates CPUApp's RPK (`region`, `page`, `key`) to the Ares UserIO address (`module`, `keySet`, `key`); AresDisplayApp must not invent CPU page/key identities. Mentrix F1-F4 are special region-0/function-key paths, not ordinary four-key matrix keysets; inspect both CPUApp VSeries code and `PanelAres.cpp`.

#### Address spaces and mapping

| Layer | Address | Owner/meaning |
|---|---|---|
| CPUApp | `RPK = region, page, key` | Authoritative matrix key identity |
| PlutoApp legacy layout | module/keyset index/key-in-set | Internal CPU/Iris-style grouping |
| Ares DisplayApp/UserIO | `module, keySet, key` | Physical Ares UI address |

For a normal Ares matrix key, key positions in each keyset are usually: `key:0` talk/primary, `key:1` listen, `key:2` volume down, `key:3` volume up. PlutoApp mapping tables determine which CPU region/keyset becomes each Ares `keySet`; do not infer keyset from display coordinates. CPU page is not part of the physical Ares keyset, so a shift-page change can retain the same DisplayApp keyset while changing CPU RPK.

Page-qualified operations must retain full RPK—not only the Ares keyset. Relevant code: `PanelAres.cpp` and `UserIO/UserIOPluto.cpp`. Detailed tables/examples: `~/AresCPUModuleMapping.md`.

Mentrix F1-F4 are the exception: CPU region `0`, page `255`, keys `82`-`85`. DisplayApp mode targets are module `0`/keySets `82`-`85`; normal input uses module `0` with the function key number. Mode target and input identity therefore have different JSON shapes.

#### DPI -> UserIO diagnostic chain

For an Ares label, indication or key-state issue, trace every boundary:

```text
MVX/IVP raw DPI
  -> PlutoIVPManager::processRawDpi / dpiEvents
  -> endianness conversion
  -> CDumbPanel::RxDumbPanelMessage
  -> Panel/PanelAres CPU-RPK-to-Ares mapping
  -> UserIOPluto JSON packer/publisher
  -> ZMQ userio-proxy
  -> AresDisplayApp rendering
```

Implementation points: `PlutoIVPManager::processRawDpi`, `dpiEvents` in `VSeriesApp-DSP-app/main/main.cpp`, `DPIEndianConverter::ConvertToLittleEndian`, `DumbPanel.cpp:CDumbPanel::RxDumbPanelMessage`, `Panel.cpp`, `PanelAres.cpp`, `UserIOPluto.cpp`, `UserIOPublisher.cpp`, `UserIODisplayJSONPacker.cpp`.

Wire/diagnostic traps:

- CPUApp labels commonly arrive as `CC_VAR_KEY_UNICODE_TEXT` or `CC_KEY_TEXT_DATA_VL`. The variable-Unicode form is a length-counted UTF-16 payload, not NUL-terminated; use the supplied character count and endian conversion.
- LED/indication updates use the `MsgIDLedData`/`MsgIDLedFlashRate` path and `SetLEDFlashParams`/`SetLedState`; not every visible state is text.
- Shift-page names and other online data are cached by `CDataRegistryUserIO` and emitted in a debounced batch. A missing label can therefore be a DPI receipt, mapping, registry, packer, ZMQ or display failure.
- Compare `/var/log/pluto.log` with `/var/log/userio-proxy.log` (some targets use `/var/log/UserIOProxyApp.log`): DPI receipt -> `RxDumbPanelMessage` -> mapped UserIO publish -> proxy receipt.

Longer guide: `~/work/ares_dpi_userio_guide.md` (source/function and target-grep walkthrough).

#### CPUApp Mentrix facts

CPUApp identifies Mentrix as `PANEL_TYPE_MENTRIX_DESK` (`0x8410`) and maps it to `rARES_DESK`. Mentrix participates in selected V-Series, enhanced-DPI and IVC-client behavior, but not every contiguous V-Series subtype predicate; role compatibility has a separate Mentrix endpoint-mask bit. It has its own physical layout, three page-changing modules and a distinct function-key refresh path even where it reuses V-Series action code.

#### Build and source map

Both endpoint modes use the same script; `ares` selects UserIO mode (`USERIO_ARES=1`), while omission selects CANBUS (`USERIO_ARES=0`):

```bash
cd ~/work/cc-clearcom/firmware/applications/PlutoApp

# Ares/Mentrix: UserIO/ZMQ
./make_ti build ares

# Iris/VSeries: CANBUS
./make_ti build
```

Relevant locations:

- `firmware/applications/PlutoApp/`: PlutoApp and IVP/DPI/panel handling.
- `firmware/applications/PlutoApp/src/VSeriesApp-DSP-app/panel/PanelAres.cpp`: Ares DPI-to-display handling.
- `firmware/applications/PlutoApp/src/VSeriesApp-DSP-app/UserIO/`: UserIO translation, JSON packing and ZMQ publish/subscribe.
- `firmware/applications/common/UserIO/`: shared definitions.
- `firmware/applications/UserIOProxyApp/` and Ares application directories: proxy/panel-side services.
- `firmware/applications/AppHwTest/ares/`: hardware tests; `firmware/applications/script/ares/`: target scripts.
- `firmware/applications/mvswTool/`: Marvell switch tooling.
- `firmware/production/ares/README-ARES-apis.md`: Ares CCM/REST API and manufacturing tests.
- Related sources: `~/work/cc-ti-linux-kernel`, `~/work/cc-uboot-ti`, `~/work/cc-yocto-layers`.

At the system level, EHX configures Eclipse and pushes/pulls configuration to/from the Config Card; CPUApp applies it and sends labels, indications, audio/crosspoint and state updates back to the endpoint. Do not reverse this authority when debugging.

## 6. Ares/Mentrix target operations

The defaults below refer only to the known Ares lab target; prefer a user-supplied hostname/IP:

- Host: `CC-ARES-5012E32F`
- SSH port: `11430`
- SSH key: `~/keys/ares.key`
- AOIP/Minuet board: `10.0.0.1`

Check reachability first:

```bash
ping -c 1 -W 2 <host>
ssh -i ~/keys/ares.key -p 11430 root@<host>
```

A changed SSH host key after re-image must be verified as the expected target before changing `known_hosts`. Ping failure suggests target/name-resolution/network/DHCP trouble; ping success with SSH `11430` timeout/refusal may mean the target firewall still needs opening. Remount before changing/deploying target files:

```bash
mountrw.sh
```

### Target paths, services and watchdog

- Applications: `/usr/bin/`
- General logs: `/var/log/`, including `/var/log/pluto.log` and `/var/log/UserIOProxyApp.log`
- Ares/Mentrix hardware tests: `/hwtest/ares/`
- Hardware-test logs: `/DATA/log/hwtest/`
- DSP trace: `/sys/kernel/debug/remoteproc/remoteproc0/trace0`

Hardware-test logs commonly use `<SERIAL>_<TESTNAME>.log` (observed form: `5012E32F-<name>.log`). The DSP trace is circular; use timestamps to find newest events rather than assuming the last physical line is newest.

Common processes/services:

```text
userio-proxy   (UserIOProxyApp)     ares-display (AresDisplayApp)
ares-backlight (AresBacklightApp)   ares-leds    (AresLEDApp)
ares-ren       (AresRENApp)         ares-keys    (AresKeysApp)
ares-thermal   (AresThermalApp)     ares-power  (AresPowerApp)
pluto          (PlutoApp)            mmid
```

```bash
systemctl is-enabled <service>
systemctl is-active <service>
systemctl status <service>
journalctl -u <service>
```

A process watchdog monitors important services and can eventually permit a hardware-watchdog reset when a monitored process remains down. For a current-boot diagnostic, disable it before stopping/replacing monitored services and re-enable it afterward:

```bash
manageProcessWatchdog.sh -d
manageProcessWatchdog.sh -e
```

This is not persistent across reboot; disabling the watchdog is a deliberate diagnostic action, not a fix.

### AOIP/Minuet board

The optional ROSS Minuet Linux board provides AES67-related functions and is reachable at `10.0.0.1`. Access may be slow or time out during connection/banner exchange. If legacy RSA negotiation is required, use approved credentials and verify the host key:

```bash
sshpass -p '' ssh \
  -oHostKeyAlgorithms=+ssh-rsa \
  -oPubkeyAcceptedAlgorithms=+ssh-rsa \
  -oConnectTimeout=100 root@10.0.0.1
```

Treat AOIP access as conditional; report a timeout as an AOIP access issue, not an Ares-panel failure.

### Networking and APIs

- The built-in Marvell switch is configured with `mvswtool`; sources are under `firmware/applications/mvswTool/`.
- If Ares/Mentrix DHCP appears broken, taking `eth0.20` down can diagnose it but may disconnect the session:

  ```bash
  ip link set dev eth0.20 down
  ```

- Live API schemas are normally available at:
  - `http://<target-ip>/api/1/schemas/clearcom_api.json`
  - `http://<target-ip>/_api/1/schemas/clearcom_api_internal.json`

## 7. Other families

- **Arcadia:** a central station/IP platform, not an Eclipse HX Config Card. In Atlas/Neptune material, CCM can create a V-Series role and the result appears through DpiServer/DPI. Identify the Arcadia/Neptune/Atlas service and bridge before applying CPUApp-on-physical-card assumptions.
- **LQ:** begin at the LQ/IVR or IClient boundary, then trace IVP media, presence/signalling, audio-manager selection and MMID/REST configuration. Useful references: `firmware/c4-models/ivcore/ivrouting-docs/routing.md`, `firmware/c4-models/ivcore/docs/README-IclientAudioManager.md`, `firmware/c4-models/atlas/docs/ivcore.md`, `firmware/c4-models/neptune/docs/ivcore.md`.
- **HelixNet:** identify its endpoint adapter, IVCore/IClient path and matrix-side interface before reusing RPK, CANBUS or UserIO logic.
- **Virtual clients:** Agent-IC Android/iPhone and Station-IC Windows/macOS are software endpoints. Trace host connection, IClient/IVP media, presence/signalling, audio manager and authentication/configuration; supported paths can include Eclipse E-IPA/IVC-32 and LQ/other IP interfaces, so verify the deployment rather than assuming a direct CPUApp DPI socket.

## External product references

Product pages provide terminology; repository implementation files are authoritative for behavior:

- [Clear-Com product catalog](https://www.clearcom.com/Products)
- [Eclipse HX](https://www.clearcom.com/Products/Products-by-Name/Eclipse-HX)
- [EHX Configuration Software](https://www.clearcom.com/Products/Products-by-Name/Eclipse-HX/category/ehx-configuration-software)
- [V-Series IrisX keypanels](https://www.clearcom.com/Products/Products-By-Name/Eclipse-HX/category/v-series-irisx-keypanels)
- [Arcadia Central Station](https://www.clearcom.com/Templates/Secondary-Landing/arcadia-central-station)
- [LQ Series](https://clearcom.com/Products/Products-by-Name/LQ-Series)
- [Virtual clients](https://www.clearcom.com/Products/Products-By-Name/Gen-IC/category/virtual-clients-1)
