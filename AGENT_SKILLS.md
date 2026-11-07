# Motion Agent Skills

Motion Agent now has a Remotion-style Agent Skills layer: small, task-specific instruction packs for Claude Code, Codex, Cursor, or any skills-compatible agent.

The existing `skill/SKILL.md` remains the deep AE operations manual. These skills are the routing layer that tells an agent which production workflow to follow before it opens that manual.

## Install Locally

Copy or symlink the skill folders into your agent skills directory, or point the agent at this folder:

```bash
agent-skills/
  motion-agent-best-practices/
  ae-gsap-motion/
  motion-create/
  motion-ae-rig/
  motion-qa/
  motion-retrospective/
  motion-replicate/
```

## Skill Map

| Skill | Use when |
|---|---|
| `/motion-agent-best-practices` | Unsure where to start, or doing any AE automation with Motion Agent |
| `/ae-gsap-motion` | Translating GSAP timelines, staggers, easing, scrub, Flip, or SplitText concepts into AE-native rigs and keyframes |
| `/motion-create` | Starting a new motion piece, shot, demo, campaign video, or AE composition |
| `/motion-ae-rig` | Building reusable AE controls, controller nulls, expressions, presets, and editable rigs |
| `/motion-qa` | Checking visual quality, timing, safety zones, layer integrity, and reference match |
| `/motion-replicate` | The user pastes a Pinterest, Behance or video link and wants the animation recreated in AE |
| `/motion-retrospective` | Right after the user confirms a final render: replay the build, add recipes and rules to the library, publish |

## Design Borrowed From Remotion

Remotion's strong idea is not "AI makes a video." It is "domain expertise becomes agent-readable skills." This layer applies the same idea to After Effects production:

- creative briefs become structured plans
- repeated motion patterns become reusable workflows
- AE controls stay editable by designers
- validation happens through captured frames and measured evidence
- every reusable lesson is promoted back into a skill or case

## Relationship To The Original Skill

Use the original `skill/SKILL.md` for fragile AE execution rules: ES3 ExtendScript, `run_jsx.sh`, bridge safety, effect `matchName` lookup, controller surgery, and pitfall tables.

Use this new `agent-skills/` layer for task routing and production workflow shape.
