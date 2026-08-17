---
name: Panel
description: A Persian RTL network-operations shift board for VPN reseller teams.
colors:
  ink: "#0B0E19"
  panel: "#111425"
  panel-raised: "#181D33"
  field: "#0E1222"
  seam: "#2A3150"
  text: "#F1F4EF"
  muted: "#9AA3BD"
  signal: "#8B7CFF"
  signal-hover: "#A99FFF"
  healthy: "#52D3B0"
  warning: "#F0A45D"
  danger: "#F27368"
typography:
  display:
    fontFamily: "Vazirmatn, system-ui, sans-serif"
    fontSize: "2.25rem"
    fontWeight: 700
    lineHeight: 1.35
  headline:
    fontFamily: "Vazirmatn, system-ui, sans-serif"
    fontSize: "1.875rem"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "-0.02em"
  title:
    fontFamily: "Vazirmatn, system-ui, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 600
    lineHeight: 1.5
  body:
    fontFamily: "Vazirmatn, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.75
  label:
    fontFamily: "Vazirmatn, system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 400
    lineHeight: 1.5
  numeric:
    fontFamily: "JetBrains Mono, ui-monospace, monospace"
    fontSize: "0.875rem"
    fontWeight: 500
    lineHeight: 1.5
rounded:
  segment: "2px"
  sm: "8px"
  control: "10px"
  inset: "12px"
  surface: "14px"
  modal: "16px"
  pill: "9999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  control-x: "16px"
  surface: "20px"
  section: "32px"
  page-mobile: "16px"
  page-desktop: "40px"
components:
  button-primary:
    backgroundColor: "{colors.signal}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.control}"
    padding: "10px 16px"
    height: "40px"
  button-primary-hover:
    backgroundColor: "{colors.signal-hover}"
    textColor: "{colors.ink}"
  button-ghost:
    backgroundColor: "{colors.panel-raised}"
    textColor: "{colors.text}"
    rounded: "{rounded.control}"
    padding: "10px 16px"
    height: "40px"
  input:
    backgroundColor: "{colors.field}"
    textColor: "{colors.text}"
    typography: "{typography.body}"
    rounded: "{rounded.control}"
    padding: "10px 14px"
  card:
    backgroundColor: "{colors.panel-raised}"
    textColor: "{colors.text}"
    rounded: "{rounded.surface}"
  status-chip:
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "2px 8px"
---

# Design System: Panel

## Overview

**Creative North Star: "NOC Shift Board"**

Panel is a matte blue-black operations instrument: dense enough for a working shift, calm enough to leave open all day, and explicit about what needs intervention. Its visual hierarchy begins with exceptions and live state, then exposes supporting inventory and metrics without turning the dashboard into a decorative analytics canvas.

The system is code-led and deliberately avoids an AI-created feel. Repeated primitives, fine seams, disciplined Persian RTL typography, tabular numeric readouts, and restrained ambient depth give it the character of dependable network equipment rather than a generic gradient dashboard. Electric violet is rare and operational: it marks the current route, primary action, focus, or a meaningful signal.

**Key Characteristics:**

- Matte green-black instrument surfaces with fine structural seams.
- Exception-first operational hierarchy and compact, scannable density.
- Persian RTL prose paired with isolated LTR monospaced numerics.
- Violet action emphasis supported by semantic health, warning, and danger tones.
- Restrained ambient depth and a short page-resolve motion on navigation.

## Colors

The palette is a low-reflectance blue-black equipment rack with one high-visibility signal and unambiguous semantic states.

### Primary

- **Signal Violet:** The scarce high-contrast voice for primary actions, active navigation, links, focus outlines, selection, and signal highlights.

### Secondary

- **Healthy Mint:** Confirms active servers, successful states, and normal live operation without competing with the primary action.
- **Service Amber:** Marks expiring service, partial data failures, and other conditions requiring near-term attention.
- **Fault Coral:** Marks expired, destructive, failed, or offline states.

### Neutral

- **Rack Ink:** The page canvas and deepest inset surface.
- **Console Panel:** The standard application and modal surface.
- **Raised Instrument:** Interactive rows, ghost controls, skeletons, and higher tonal layers.
- **Fine Seam:** Borders, dividers, inactive gauge segments, and table structure.
- **Instrument White:** Primary copy and high-confidence values.
- **Telemetry Gray:** Secondary copy, labels, placeholders, and inactive navigation.

### Named Rules

**The Rare Signal Rule.** Signal Violet is reserved for action, focus, active location, and meaningful live emphasis; it is not a decorative wash.

**The State Has Meaning Rule.** Mint means healthy, amber means attention, and coral means failure or danger. Never swap these roles for variety.

## Typography

**Display Font:** Vazirmatn (with system UI and sans-serif fallbacks)
**Body Font:** Vazirmatn (with system UI and sans-serif fallbacks)
**Label/Mono Font:** JetBrains Mono (with ui-monospace and monospace fallbacks)

**Character:** Vazirmatn keeps Persian operational copy direct and disciplined across headings, controls, and tables. JetBrains Mono turns usage, counts, dates, panel types, and technical identifiers into stable telemetry; tabular numerals are enabled globally.

### Hierarchy

- **Display:** Bold, spacious product statement used on the desktop login panel only.
- **Headline:** Bold page status heading with tight tracking; responsive from compact mobile to desktop.
- **Title:** Semibold screen and major section titles.
- **Body:** Regular operational copy, controls, rows, and supporting explanations.
- **Label:** Compact muted metadata, form labels, statuses, and navigation annotations.
- **Numeric:** Monospaced LTR-isolated telemetry, kept legible inside the RTL interface.

### Named Rules

**The RTL Prose, LTR Telemetry Rule.** Persian language and layout stay RTL; numbers, URLs, dates, and machine identifiers use isolated LTR mono runs.

**The Weight Before Size Rule.** Establish hierarchy primarily with weight, tone, and spacing; reserve oversized type for login and top-level status.

## Layout

The desktop shell uses a fixed 17.5rem right-side rail, a 4rem utility header, and a fluid content canvas capped at 88rem. Page gutters are compact on mobile and expand on desktop; major sections follow a 2rem vertical rhythm, while cards and rows use 12–24px internal spacing.

Operational pages lead with current state, then summary metrics, then an asymmetric working grid: the primary inventory receives roughly twice the width of the attention queue. At the `lg` breakpoint the overview resolves to four metrics and a 1.55:0.75 working split. Below `md`, the rail becomes a fixed top header plus a thumb-reachable bottom navigation, with safe-area padding and enough page padding to avoid occlusion.

**The Exceptions First Rule.** Place failures, expiring service, retry actions, and stale-data signals where an operator encounters them before secondary detail.

**The Dense, Never Cramped Rule.** Preserve scan-friendly rows and compact metadata, but retain 40px minimum controls, 60px mobile navigation targets, and breathing room between task groups.

## Elevation & Depth

Depth is mostly tonal and structural. Cards use a diagonal dark surface gradient, a one-pixel seam, and a faint lime top glint; shadows are broad, low-opacity ambient separation rather than floating-card spectacle. Stronger depth is reserved for the login enclosure and modal layer.

### Shadow Vocabulary

- **Signal Ambient** (`0 8px 24px rgba(139,124,255,.20)`): Primary buttons, brand mark, and other compact active signal elements.
- **Active Route Ambient** (`0 10px 28px rgba(139,124,255,.18)`): Selected desktop navigation only.
- **Surface Ambient** (`0 18px 50px rgba(0,0,0,.16)`): Standard cards and operational containers.
- **Login Enclosure** (`0 35px 100px rgba(0,0,0,.38)`): The isolated authentication composition.

**The Tonal First Rule.** Use background steps and seams before adding shadow; shadow confirms hierarchy but does not create it.

## Shapes

The form language is precise but not severe. Controls use a consistent 10px corner, standard operational surfaces use 14px, and modal/login enclosures reach 16px. Status dots and chips are fully round; the segmented signal gauge uses tight 2px corners to retain a hardware-readout character. Fine one-pixel borders remain visible throughout the dark palette.

**The Controlled Radius Rule.** Use the documented radius scale; avoid mixing arbitrary soft cards or fully rounded controls into the instrument surfaces.

## Components

### Buttons

- **Shape:** Compact, assured controls with a 10px radius and 40px minimum height.
- **Primary:** Signal Violet on Rack Ink, semibold, with a restrained lime ambient shadow.
- **Hover / Focus:** Brighten to Signal Violet Hover; use the global 2px Signal Violet focus outline with 3px offset. Active state scales to 98%.
- **Ghost:** Raised Instrument with Fine Seam border; hover raises the tonal surface and softens the seam toward Telemetry Gray.
- **Danger:** A translucent Fault Coral surface and border; deepen the tint on hover.

### Chips

- **Style:** Compact 11px labels, 2px by 8px padding, pill silhouette, and a translucent semantic tint with matching border.
- **State:** Health, warning, danger, and inactive states retain their semantic color assignments; selectable server chips use a restrained Signal Violet tint.

### Cards / Containers

- **Corner Style:** Operational surfaces use a 14px radius; dialogs use 16px.
- **Background:** A near-black green diagonal gradient over Raised Instrument and Console Panel tones.
- **Shadow Strategy:** Broad low-opacity ambient depth, subordinate to tonal layering and seams.
- **Border:** One-pixel Fine Seam, often with a faint lime top glint.
- **Internal Padding:** Typically 16–24px; row containers may place dividers edge to edge.

### Inputs / Fields

- **Style:** Dark inset field, Fine Seam border, 10px radius, 14px horizontal padding, and 16px mobile text to prevent iOS focus zoom.
- **Focus:** Signal Violet border plus a soft two-pixel lime ring and the global visible outline.
- **Error / Disabled:** Errors use Fault Coral text and translucent surface/border; disabled actions retain shape and drop to 50% opacity.

### Navigation

Desktop navigation occupies the fixed right rail with icon-and-label rows. The active route becomes a solid Signal Violet instrument tab; inactive routes remain muted and lift tonally on hover. Mobile uses fixed top and bottom bars with translucent rack surfaces, backdrop blur, safe-area padding, and an active violet icon/label treatment rather than a filled tab.

### Signal Gauge

The signature usage/time gauge is a 24-segment hardware-style readout. Filled segments take the selected semantic tone, empty segments use Fine Seam, unlimited state uses a subdued violet signal, and usage above 90% overrides the gauge to Fault Coral.

### Loading, Error, and Retry Regions

Skeletons use a Raised Instrument base with a narrow traveling violet signal. Loading containers expose live status semantics; failures remain in context and present a visible Signal Violet retry action instead of collapsing the surrounding card.

### Motion

Route content resolves over 260ms with a 7px rise, blur reduction, and `cubic-bezier(.23,1,.32,1)`. Toasts enter in 180ms and mobile sheets in 240ms. The Overview network topology is the single authored focal moment: real server and user counts resolve through a 700ms line-and-node sequence, while its loader turns slowly at 1.8s. Frequent navigation, fields, and row interactions stay at 150ms and animate only color, border, shadow, opacity, or transform. Reduced-motion preference removes spatial movement and replaces transient entrances with short opacity fades.

## Do's and Don'ts

### Do:

- **Do** lead working screens with live state, exceptions, and retry paths.
- **Do** preserve Persian RTL alignment while isolating technical telemetry as LTR mono text.
- **Do** use Fine Seam borders and tonal steps as the default structure.
- **Do** keep Signal Violet rare enough that active routes, focus, links, and primary actions remain unmistakable.
- **Do** pair every color-coded state with readable text, labels, or accessible names.
- **Do** honor reduced motion and maintain visible keyboard focus.

### Don't:

- **Don't** introduce glossy gradients, neon bloom, glass-card stacks, oversized metric art, or decorative dashboard chrome.
- **Don't** spread Signal Violet across passive backgrounds or use semantic state colors interchangeably.
- **Don't** center operational prose or force RTL numbers and URLs into visually unstable runs.
- **Don't** hide errors in transient notifications alone; preserve contextual failure and retry UI.
- **Don't** improvise unrelated radii, shadows, typefaces, or one-off card treatments.
- **Don't** fabricate team, security, reliability, or performance claims in the interface.
