---
title: LTX Configs
section: Configs
order: 1
tags: ltx, tuning, balance
summary: A practical approach to editing gameplay parameters.
---

# LTX Configs

LTX files describe many gameplay entities: weapons, items, NPC sections, weather, and economy. For modding, the important part is keeping changes readable.

## Recommendations

- Change one group of parameters at a time and verify the result in game.
- Keep the original value nearby when a balance parameter is reviewed often.
- Group related sections in one knowledge base document.

```ini
[wpn_example]:identity_immunities
hit_power = 0.42
fire_distance = 600
control_inertion_factor = 1.2
```

## What to document

Record the section purpose, key parameters, compatibility risks, and gameplay scenarios where the change should be visible.
