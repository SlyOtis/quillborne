---
description: Which button primitive a control uses, and when a control carries a frame at all
paths:
  - "web/src/components/**"
  - "web/src/pages/**"
---

## The four

`Button` carries a word. Primary, secondary, ghost, danger and plain, which is the words alone with no frame. Anything the user reads as a sentence is this and nothing else.

`FrameBtn` is a glyph inside a traced frame. It is the forged HUD button: the shell bar handles, the dialog close, the section header sigils on the hearth. Reach for it when the control is a landmark the eye should find without reading.

`IconBtn` is a glyph and nothing around it. No border, no background, no plate. It is the default for a glyph-only control, and `FrameBtn` is the exception that has to earn its frame.

`Stat` is the pressable plate that shows a figure. A roll, a score, a toggle that reads as a number.

## The rule

A control that shows only an icon has no frame and no background unless the design asks for one by name. A fold, a zoom step, a block handle, a row action, a close on something small: all `IconBtn`.

A frame is for a control that has to read as a fixture of the surface it sits on. If it sits inside a panel that already has a border, it does not get a second one.

Never hand roll a `<button>` with a border and a background around a glyph. That is `FrameBtn`, or it should not have had the frame.

## Size and tone

No primitive takes a size. A button is square and fills the height it is given, so the row it sits in decides how big it is. A call site that wants a bigger button gives the row more height, never a prop.

Tone names the meaning, never the colour: `metal` is neutral, `ember` is the character's own, `verdigris` is the world's, `bane` is destructive. A colour value never appears at a call site.

## What a call site decides

The call site picks the primitive, the tone and the glyph. It never restyles the primitive from outside, and it never wraps one in a div to move or size it. A primitive that will not sit right is fixed with a prop or in the primitive.
