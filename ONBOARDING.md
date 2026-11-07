# Motion Agent Onboarding Guide

This guide is for first-time Motion Agent users. It covers what to install, how to set up the AE bridge panel, how to install local video/audio analysis tools, how to connect After Effects for the first time, and how to make your first request.

中文版本: [新手指引.md](./新手指引.md)

---

## 1. What Motion Agent Is

Motion Agent is an Adobe After Effects automation assistant. You describe what you want in natural language, and the agent can create layers, write expressions, set keyframes, capture previews, inspect results, and report back from the currently open AE project.

It is not just a script generator. It communicates with AE through a local bridge panel and performs the work directly inside your project.

Typical capabilities include:

- Recreate motion structure from reference videos or screenshots
- Build adjustable animation rigs for multiple layers
- Inspect controllers, expressions, and keyframes in existing AE projects
- Generate text, UI, card, transition, and styling animations
- Validate output with screenshots, numerical checks, and comparisons

---

## 2. What You Need

You need four things:

| Item | Purpose |
|---|---|
| Adobe After Effects | The project environment Motion Agent edits |
| Codex or Claude Code | The agent interface you talk to |
| AE AI Bridge panel | The local bridge between the agent and After Effects |
| Local analysis tools | Video reading, frame extraction, contact sheets, audio reading, and rhythm analysis |

The two most commonly missed pieces are:

- **AE AI Bridge panel**: required for controlling AE.
- **Local analysis tools**: recommended for reference-video recreation, frame extraction, audio reading, and beat analysis.

---

## 3. Installer Packages

The repository provides two macOS installer packages:

```text
dist/Motion-Agent-AE-Bridge-macOS.zip
dist/Motion-Agent-Analysis-Tools-macOS.zip
```

| Package | Required | Purpose |
|---|---:|---|
| `Motion-Agent-AE-Bridge-macOS.zip` | Yes | Lets the agent control AE, inspect projects, create layers, and capture frames |
| `Motion-Agent-Analysis-Tools-macOS.zip` | Recommended | Lets the agent read videos, extract frames, read audio, and analyze rhythm |

If you are viewing the project on GitHub, download these from the latest Release or from the `dist/` folder. Unzip each package into a stable location, for example:

```text
~/Desktop/Motion-Agent-AE-Bridge-macOS
~/Desktop/Motion-Agent-Analysis-Tools-macOS
```

Do not run the installers from a temporary preview window. Unzip the package first, then install.

---

## 4. Install AE AI Bridge

### 4.1 Easiest Method

1. Unzip `Motion-Agent-AE-Bridge-macOS.zip`.
2. Open the extracted folder.
3. Double-click `install.command`.
4. If macOS blocks it, right-click `install.command` and choose `Open`.
5. When Terminal shows `Installed AE AI Bridge to:`, installation is complete.

The installer automatically finds After Effects and installs the panel to a path like:

```text
/Applications/Adobe After Effects 2026/Scripts/ScriptUI Panels/Motion Agent.jsx
```

It also creates the local command queue at `~/Library/Application Support/Motion Agent/runtime`:

```text
runtime/
  commands/
  results/
  previews/
```

### 4.2 If You Have Multiple AE Versions

You can specify the AE version manually:

```bash
./install-macos.sh "/Applications/Adobe After Effects 2026"
```

Most users do not need this. Use it only if the automatic installer picks the wrong AE version.

---

## 5. Open the Bridge in After Effects

After installation:

1. Restart After Effects, or close and reopen it.
2. Open any AE project. A new empty project is fine.
3. In the AE menu, open:

```text
Window > Motion Agent.jsx
```

You should see an `AE AI Bridge` panel.

Main buttons:

| Button | Purpose |
|---|---|
| `Codex Desktop` | Connects the queue for Codex |
| `Claude Code Desktop` | Connects the queue for Claude Code |
| `Check AE Permission` | Checks whether AE allows scripts to read/write local files |
| `More Settings` | Shows or changes the runtime queue path |
| `Disconnect` | Stops listening to the command queue |

If you use Codex, click `Codex Desktop`. If you use Claude Code, click `Claude Code Desktop`. Both buttons connect the same local queue.

---

## 6. Required AE Permission

On first connection, AE may block script file access. Open:

```text
After Effects > Settings > Scripting & Expressions
```

or, in older AE versions:

```text
After Effects > Preferences > Scripting & Expressions
```

Enable:

```text
Allow Scripts to Write Files and Access Network
```

This permission lets the bridge read and write local files under `runtime/commands/` and `runtime/results/`. The bridge uses a local file queue. It does not require a network server and does not send your AE project over the network.

After enabling it, return to the `AE AI Bridge` panel and click `Codex Desktop` again.

---

## 7. Verify the AE Connection

After opening the AE panel and clicking `Codex Desktop`, run this from the AE Bridge package folder:

```bash
node send-command.js ping
```

Success looks like:

```json
{
  "ok": true,
  "data": {
    "pong": true
  }
}
```

This confirms:

1. Commands can be written into the local queue.
2. The AE panel is listening to that queue.
3. AE can write results back to the local result files.

To confirm that the agent can inspect the current project, run:

```bash
node send-command.js inspectProject
```

It should return project, composition, and asset information from the open AE project.

---

## 8. Install Local Video/Audio Analysis Tools

If you want Motion Agent to inspect reference videos, extract frames, or analyze music rhythm, install the second package:

```text
dist/Motion-Agent-Analysis-Tools-macOS.zip
```

### 8.1 What It Installs

| Tool | Purpose |
|---|---|
| `ffmpeg` | Frame extraction, transcoding, audio extraction |
| `ffprobe` | Video duration, frame rate, resolution, and audio stream inspection |
| `numpy` | Numerical processing and pixel differences |
| `pillow` | Image loading and contact sheet creation |
| `opencv-python` | Video frame reading, template matching, motion measurement |
| `librosa` | Rhythm, onset, and energy peak analysis |
| `soundfile` / `scipy` | Audio loading and signal processing |

These are local analysis tools, not AE plugins.

### 8.2 Installation

1. Unzip `Motion-Agent-Analysis-Tools-macOS.zip`.
2. Open the extracted folder.
3. Double-click `install.command`.
4. If macOS blocks it, right-click `install.command` and choose `Open`.

If the installer asks for Homebrew, install Homebrew first. Homebrew is used to install `ffmpeg`.

### 8.3 Verification

After installation, double-click `verify.command`, or run:

```bash
./verify.command
```

Success looks like:

```text
Analysis toolchain OK
```

---

## 9. First Real Use

After the bridge connection works, you can describe your request in Codex or Claude Code.

### 9.1 Inspect the Current Project First

Recommended first request:

```text
Please inspect the current AE project and tell me which comps exist, which comp is active, and what the main layers are.
```

This confirms that the agent sees the same project you are looking at.

### 9.2 Recreate a Reference Motion

Example:

```text
Please recreate the card transition from 8s to 12s in this reference video. After building it, show me a screenshot comparison.
```

The agent usually:

1. Reads the reference.
2. Analyzes size, position, angle, timing, and motion.
3. Builds the layers and animation in AE.
4. Captures screenshots or comparisons.
5. Iterates based on your feedback.

### 9.3 Build an Adjustable Rig

Example:

```text
Please build a 3D card tour rig for these 8 layers in the main comp. I need controls for speed, radius, card size, and depth blur.
```

The agent should prefer clear controller layers and named sliders so later changes happen through controls instead of hard-coded keyframes.

---

## 10. Request Examples

| Goal | Example |
|---|---|
| Recreate reference motion | “Recreate the animation from 3s to 6s in this video.” |
| Text animation | “Make this title pop in letter by letter, with a sports-promo feel.” |
| Card carousel | “Make these cards into an adjustable 3D tour.” |
| UI animation | “Create a liquid-glass button with a light click rebound.” |
| Styling | “Add a dark premium look and soft glow edges to this title.” |
| Transition | “Add a card relay transition between these two sections.” |
| Project analysis | “Check which controllers are actually driving the current project.” |
| Timing adjustment | “Make the entrance softer, but keep the edit points unchanged.” |

If you cannot describe the motion precisely, provide a screenshot, video, or link and point to the part you want to match.

---

## 11. How to Describe Requests Clearly

Useful details:

- Target comp name
- Relevant layers or assets
- Reference video, screenshot, or exact time range
- Visual traits to preserve or avoid
- Whether the result needs adjustable controls
- Whether you need screenshots, metrics, or comparison frames

You do not need professional terminology. You can say things like “too stiff,” “too slow,” “lighter,” or “more like the impact in the reference.” The agent will translate those notes into keyframes, easing, expressions, or parameter changes.

---

## 12. Troubleshooting

| Problem | What to do |
|---|---|
| `Motion Agent.jsx` does not appear in the AE Window menu | Run `install.command`, then restart AE. |
| macOS blocks `install.command` | Right-click it and choose `Open`. |
| `node send-command.js ping` says node is missing | Install Node.js, or run from a terminal where Node.js is available. |
| `ping` times out | Make sure AE is open, the bridge panel is open, and `Codex Desktop` has been clicked. |
| The bridge says permission is needed | Enable `Allow Scripts to Write Files and Access Network` in AE settings. |
| Video reading or frame extraction fails | Install `Motion-Agent-Analysis-Tools-macOS.zip`, then run `verify.command`. |
| Audio rhythm analysis fails | Check that `librosa`, `soundfile`, and `scipy` pass in the analysis package verification. |
| The analysis installer says Homebrew is missing | Install Homebrew first, then rerun `install.command`. |
| The agent sees the wrong project | Activate the correct AE project/comp, then ask the agent to run `inspectProject` again. |
| You manually changed agent-created layers | Tell the agent what you changed so it can re-inspect the current state. |
| The result looks wrong | Describe the visual difference directly, such as “too fast,” “not enough pause,” or “wrong angle.” |

---

## 13. Case Library and Templates

The `cases/` folder stores reusable motion recipes by category:

- Text animation
- Shape animation
- UI animation
- Transitions
- Effects and styling

Mature cases usually include:

- `RECIPE.md`: technique breakdown and reuse rules
- `PROMPT_TEMPLATE.md`: fill-in request template
- `PARAMS.json`: suggested parameter ranges
- Evidence images or metric files

Example request:

```text
Use the 3D card relay transition template from the case library and apply it between these two sections.
```

---

## 14. Summary

Install `AE AI Bridge`, open it in AE, click `Codex Desktop`, and verify the connection with `node send-command.js ping`. If you need reference-video or music analysis, install `Motion-Agent-Analysis-Tools-macOS.zip` and run `verify.command`. After that, open your AE project and describe the motion you want.
