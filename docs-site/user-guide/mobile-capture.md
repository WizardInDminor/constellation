# Mobile Capture (iOS Shortcuts)

Capture thoughts from the iPhone directly into Constellation, with no intermediary and no cloud staging. The phone hits the same `POST /api/v1/nodes/fleeting` endpoint that the browser quick-capture and the `con` CLI use, so every mobile note lands in the same inbox and goes through the same embedding pipeline as everything else.

The transport is [Tailscale](https://tailscale.com): your laptop and your phone join a private mesh network, and the Shortcut POSTs to the laptop's Tailscale IP. No public endpoint, no auth layer, no third-party staging.

---

## How it works

```
iPhone (Shortcuts.app) ──HTTPS over Tailscale──▶ MacBook (uvicorn :8000) ──▶ SQLite + embedding queue
```

There is no offline queue. If the laptop is asleep or off the network, the Shortcut surfaces a visible failure — the captured thought is not silently buffered. The mitigation is to keep the laptop awake (see [Keep the laptop awake](#keep-the-laptop-awake) below).

---

## Prerequisites

- A Tailscale account (free tier is fine).
- Tailscale installed on the **laptop** and signed in.
- Tailscale installed on the **iPhone** (App Store) and signed in with the same account.
- Constellation backend running on the laptop (typically via the systemd user service — see [Capture → Systemd service](capture.md#systemd-service)).

---

## Step 1 — Bind the backend to `0.0.0.0`

By default uvicorn binds to `127.0.0.1`, which is only reachable from the laptop itself. To accept connections from Tailscale peers, the backend has to listen on `0.0.0.0`. The `constellation.service` systemd unit in this repo already does this:

```ini
ExecStart=…/uvicorn app.main:app --host 0.0.0.0 --port 8000
```

If you previously installed the service before this change, copy the updated unit and reload:

```bash
cp backend/constellation.service ~/.config/systemd/user/
systemctl --user daemon-reload
systemctl --user restart constellation
```

Verify the new bind:

```bash
ss -ltn | grep ':8000'
# LISTEN 0 2048 0.0.0.0:8000 0.0.0.0:*
```

The `0.0.0.0` here is safe specifically because Tailscale is your access boundary — the laptop is on a private mesh and not exposed to the public internet. If you run Constellation on a machine that is publicly reachable, do not use this configuration without an auth layer in front.

---

## Step 2 — Find the laptop's Tailscale IP

On the laptop:

```bash
tailscale ip -4
# 100.x.y.z
```

This `100.x.y.z` is the address the phone will hit. It's stable across reboots; you only need to change it if you re-register the device in Tailscale.

Sanity-check from any other Tailscale peer (another machine, or the phone's browser):

```
http://100.x.y.z:8000/health
# → {"status":"ok"}
```

If that loads, the network path is good. If not, see [Troubleshooting](#troubleshooting).

---

## Step 3 — Build the three Shortcuts

Each Shortcut starts with the same first action: a **Text** action containing the Tailscale base URL, saved into a variable named `TailscaleBase`. This is the only Shortcut-specific thing you'd need to update if the IP ever changes — one line per Shortcut.

`.shortcut` files are binary and don't review well in a repo, so the three Shortcuts are documented here action-by-action. Build each one in the iOS Shortcuts app (New Shortcut → add actions in order).

### Shortcut A — "Capture Note" (manual, two-prompt, Siri-triggerable)

For when you have a moment to type but you're on the phone instead of the laptop.

| # | Action | Configuration |
|---|--------|---------------|
| 1 | **Text** | `http://100.x.y.z:8000` |
| 2 | **Set Variable** | Variable Name: `TailscaleBase`. Input: result of action 1. |
| 3 | **Ask for Input** | Prompt: `Title`. Input Type: `Text`. |
| 4 | **Set Variable** | Variable Name: `Title`. Input: result of action 3. |
| 5 | **Ask for Input** | Prompt: `Content (optional)`. Input Type: `Text` with **Allow Multiple Lines** on. Default Answer: empty. |
| 6 | **Set Variable** | Variable Name: `Content`. Input: result of action 5. |
| 7 | **Dictionary** | Add two text keys: `title` → `Title` variable; `content` → `Content` variable. |
| 8 | **Get Contents of URL** | URL: `[TailscaleBase]/api/v1/nodes/fleeting`. Method: `POST`. Headers: `Content-Type: application/json`. Request Body: `JSON`, source = the dictionary from action 7. |
| 9 | **If** | Condition: `Status Code` of action 8 ≠ `201`. **Show Notification**: `Capture failed`. **Otherwise**: **Show Notification**: `Captured: [Title]`. End If. |

Then in **Shortcut Details** (top icon in the editor):

- Turn on **Use with Siri** and record the phrase `Capture note`.

You can now say "Hey Siri, capture note" and Siri will read out the two prompts.

### Shortcut B — "Capture from Text" (Share Sheet)

For when you've selected text in Safari, a reading app, or anything that supports the iOS Share Sheet.

| # | Action | Configuration |
|---|--------|---------------|
| 1 | **Receive** | Receive **Text** input from **Share Sheet**. If there's no input, **Stop and Exit**. |
| 2 | **Set Variable** | Variable Name: `Selected`. Input: Shortcut Input. |
| 3 | **Text** | `http://100.x.y.z:8000` |
| 4 | **Set Variable** | Variable Name: `TailscaleBase`. Input: action 3. |
| 5 | **Split Text** | Text: `Selected`. Separator: **New Lines**. |
| 6 | **Get Item from List** | Get **First Item** from action 5. |
| 7 | **Set Variable** | Variable Name: `SuggestedTitle`. Input: action 6. |
| 8 | **Ask for Input** | Prompt: `Title`. Input Type: `Text`. Default Answer: `SuggestedTitle`. |
| 9 | **Set Variable** | Variable Name: `Title`. Input: action 8. |
| 10 | **Ask for Input** | Prompt: `Personal context (optional)`. Input Type: `Text`, multi-line on. Default Answer: empty. |
| 11 | **Set Variable** | Variable Name: `Context`. Input: action 10. |
| 12 | **Text** | Content: `[Selected]` newline newline `[Context]` (the variables interpolated, separated by a blank line). |
| 13 | **Set Variable** | Variable Name: `Body`. Input: action 12. |
| 14 | **Dictionary** | `title` → `Title`; `content` → `Body`. |
| 15 | **Get Contents of URL** | URL: `[TailscaleBase]/api/v1/nodes/fleeting`. Method: `POST`. Headers: `Content-Type: application/json`. Body: `JSON` from action 14. |
| 16 | **If** Status Code ≠ 201 → **Show Notification** `Capture failed`. Otherwise → **Show Notification** `Captured: [Title]`. |

In **Shortcut Details**:

- Turn on **Show in Share Sheet**.
- Share Sheet Types: **Text** only (uncheck others to keep the share menu tidy).

Now selecting text in any app → Share → "Capture from Text" → confirm title → add reaction → done.

### Shortcut C — "Capture Idea" (voice, hands-free)

For driving, walking, or any time looking at the screen is not possible. No confirmation prompts — speaks, fires, brief notification.

| # | Action | Configuration |
|---|--------|---------------|
| 1 | **Text** | `http://100.x.y.z:8000` |
| 2 | **Set Variable** | Variable Name: `TailscaleBase`. Input: action 1. |
| 3 | **Dictate Text** | Language: your locale (e.g., English (US)). Stop Listening: **On Pause**. |
| 4 | **Set Variable** | Variable Name: `Title`. Input: action 3. |
| 5 | **Dictionary** | `title` → `Title`; `content` → empty text. |
| 6 | **Get Contents of URL** | URL: `[TailscaleBase]/api/v1/nodes/fleeting`. Method: `POST`. Headers: `Content-Type: application/json`. Body: `JSON` from action 5. |
| 7 | **If** Status Code ≠ 201 → **Show Notification** `Capture failed`. Otherwise → **Show Notification** `Idea captured`. |

In **Shortcut Details**:

- Turn on **Use with Siri** and record the phrase `Capture idea`.

Hands-free flow: "Hey Siri, capture idea" → Siri starts dictation → speak the thought → silence triggers stop → notification confirms.

---

## Step 4 — Keep the laptop awake

The mobile capture path only works when the laptop is awake and on the Tailscale network. There is no offline queue (deliberately — see [ADR-050](../../docs/decisions.md)). A few options:

**Option A — Disable sleep on battery (persistent):**

```bash
sudo pmset -b sleep 0          # battery: never sleep
sudo pmset -c sleep 0          # AC power: never sleep
pmset -g                       # verify
```

Persistent across reboots. The downside is no automatic sleep at all, ever; you'd undo this manually if you wanted normal sleep behavior back.

**Option B — `caffeinate -i` while you're out:**

```bash
caffeinate -i &                # background; prevents idle sleep
```

Reversible (kill the process to restore normal sleep), but per-session — you'd have to remember to start it before leaving the laptop.

**Option C — LaunchAgent running `caffeinate -i` continuously:**

The most robust if you want this always-on without thinking about it. Create `~/Library/LaunchAgents/com.user.caffeinate.plist` with a `ProgramArguments` of `["/usr/bin/caffeinate", "-i"]` and `RunAtLoad`/`KeepAlive` true. `launchctl load` it once.

**Tradeoffs:** persistent settings (A, C) work without action but have global impact on power behavior. Per-session (`caffeinate`) is reversible but requires you to remember.

---

## Troubleshooting

**The Shortcut shows "Capture failed".**

1. Tailscale icon active in the iOS status bar?
2. Tailscale active on the laptop? `tailscale status` shows the laptop as online.
3. Backend running? `systemctl --user status constellation`.
4. From another Tailscale peer: `curl http://100.x.y.z:8000/health` returns `{"status":"ok"}`?
5. Right IP? `tailscale ip -4` on the laptop — compare with the `TailscaleBase` variable in the Shortcut.
6. Laptop awake? `pmset -g` (look for `sleep 0` or check the recent assertions list).

**The Shortcut runs but no note appears in the inbox.**

Check the response in the Shortcut: a 201 confirms a write. If the inbox still looks empty, refresh the page — the inbox view doesn't auto-poll.

**Tailscale IP changed.**

Edit action 1 (the `Text` action with the base URL) in each Shortcut. The variable name is the same; only the URL inside it changes.
