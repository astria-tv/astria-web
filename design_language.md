# Astria Design Language

A comprehensive guide to the visual identity and UI patterns used across Astria applications. Use this document to implement a consistent branded look and feel on any platform, including Flutter.

---

## 1. Color Palette

### Core Colors

| Token           | Hex       | Usage                                                    |
| --------------- | --------- | -------------------------------------------------------- |
| `bg-deep`       | `#171e21` | Primary background (darkest). Used for page backgrounds. |
| `bg-surface`    | `#2b3940` | Surface-level containers, cards, sidebar, tables.        |
| `bg-card`       | `#3f545e` | Higher-elevation cards, scrollbar thumbs, dividers.      |
| `cyan`          | `#00CFC8` | Primary brand accent. Buttons, links, active indicators. |
| `cyan-bright`   | `#03fff6` | Hover/pressed state for primary accent, emphasis glow.   |
| `teal`          | `#009c97` | Gradient companion to `cyan`. Used in button gradients.  |
| `text`          | `#e8edef` | Primary text color (near-white).                         |
| `text-dim`      | `#94a3ab` | Secondary/muted text. Labels, descriptions, metadata.    |

### Semantic Colors

| Purpose      | Color / Pattern                              |
| ------------ | -------------------------------------------- |
| Error        | `#dc2626` at 15% opacity bg, `#fca5a5` text  |
| Success      | `#4ade80` (green)                            |
| Warning      | `#ffb432` / `#f5a623` (amber)                |
| Info / Stats | `#3898ec` (blue), used in activity strips    |
| Playing      | `#4ade80` bg at 12% opacity, green text      |
| Paused       | `#facc15` bg at 12% opacity, yellow text     |

### Opacity & Transparency Patterns

Backgrounds extensively use RGBA transparency to create depth and frosted-glass effects:

- **Card backgrounds:** `rgba(43, 57, 64, 0.65)` — semi-transparent `bg-surface`
- **Darker underlays:** `rgba(23, 30, 33, 0.7)` — semi-transparent `bg-deep`
- **Borders:** `rgba(63, 84, 94, 0.3–0.6)` — semi-transparent `bg-card`
- **Accent highlights:** `rgba(0, 207, 200, 0.08–0.25)` — subtle cyan tints
- **Overlays:** `rgba(0, 0, 0, 0.4–0.6)` for scrims and modals

---

## 2. Typography

### Font Stack

```
Primary: 'Inter', system-ui, -apple-system, sans-serif
Monospace: 'JetBrains Mono', 'Fira Code', monospace (invite codes, technical data)
```

In Flutter, use **Inter** as the primary font family. Fall back to the system sans-serif.

### Type Scale

| Element            | Size   | Weight | Tracking       | Notes                                   |
| ------------------ | ------ | ------ | -------------- | --------------------------------------- |
| Hero title         | 42px   | 700    | -0.5px         | Largest display text                    |
| Page title (h1)    | 28px   | 700    | -0.3px         | Page headings                           |
| Detail title (h1)  | 36px   | 700    | -0.5px         | Detail/movie page headings              |
| Section title      | 20px   | 600    | default        | Section headings within pages           |
| Card heading (h1)  | 22px   | 600    | default        | Card-level titles (e.g. login card)     |
| Section header     | 18px   | 600    | default        | Sub-section headings (admin panels)     |
| Body               | 15px   | 400    | default        | Regular body copy, line-height 1.6–1.7  |
| Body small         | 14px   | 400–500| default        | Metadata rows, descriptions             |
| Caption/label      | 13px   | 500    | 0.3px          | Labels, links, secondary actions        |
| Stat value         | 28px   | 700    | default        | Large numeric callouts                  |
| Overline/label     | 11–12px| 600–700| 0.5–0.8px      | Uppercase labels, badges, table headers |
| Badge/chip         | 10–11px| 600–700| 0.3–0.5px      | Pill badges, tags                       |

### Text Colors

- **Primary text:** `text` (`#e8edef`)
- **Secondary text:** `text-dim` (`#94a3ab`)
- **Accent text:** `cyan` (`#00CFC8`) for links, active labels
- **On-accent text:** `bg-deep` (`#171e21`) for text on cyan/teal backgrounds

---

## 3. Spacing & Layout

### Content Padding

- **Page padding:** 60px horizontal, 80px top (within layout)
- **Card padding:** 32–40px horizontal, 40px vertical (login card)
- **Section spacing:** 48px between major sections
- **Component gaps:** 12–16px between related items, 20–24px between groups

### Grid System

- **Poster grid:** `auto-fill, minmax(170px, 1fr)` with 24px row gap, 18px column gap
- **Media rows:** Horizontal scroll with 18px gap between cards
- **Stats grid:** 3-column equal grid for stat panels

### Sidebar

- **Width:** 72px fixed
- **Nav button size:** 44x44px
- **Logo size:** 36x36px

---

## 4. Border Radius

| Token        | Value | Usage                                      |
| ------------ | ----- | ------------------------------------------ |
| `radius`     | 12px  | Cards, panels, posters, modals             |
| `radius-sm`  | 8px   | Buttons, inputs, smaller containers        |
| Pill/round   | 20–28px| Chips, badges, search box, pill buttons   |
| Circle       | 50%   | Avatars, icon buttons, play overlay        |
| Small accent | 4px   | Tags, rating boxes, inline badges          |

---

## 5. Elevation & Surfaces

### Surface Hierarchy (dark-to-light)

1. **Deep background** (`#171e21`) — page canvas
2. **Surface** (`#2b3940`) — cards, sidebar, tables
3. **Card** (`#3f545e`) — elevated items, interactive elements

### Glassmorphism / Frosted Glass

Used extensively throughout the UI:

- **Backdrop blur:** `blur(12–24px)`
- **Background:** Semi-transparent surface color
- **Border:** 1px solid semi-transparent `bg-card`

Example (login card):
```
background: rgba(43, 57, 64, 0.65)
backdrop-filter: blur(24px)
border: 1px solid rgba(63, 84, 94, 0.5)
```

### Shadows

| Context            | Shadow                                       |
| ------------------ | -------------------------------------------- |
| Card hover         | `0 8px 24px rgba(0, 0, 0, 0.2–0.25)`        |
| Modal              | `0 24px 64px rgba(0, 0, 0, 0.4)`            |
| Poster detail      | `0 16px 48px rgba(0, 0, 0, 0.5)`            |
| Primary button     | `0 4px 16–20px rgba(0, 207, 200, 0.25–0.3)` |
| Primary btn hover  | `0 8px 24–28px rgba(0, 207, 200, 0.35–0.4)` |
| Dropdown           | `0 8px 32px rgba(0, 0, 0, 0.4)`             |

---

## 6. Components

### Buttons

#### Primary Button
- **Background:** `linear-gradient(135deg, cyan, teal)` → `linear-gradient(135deg, #00CFC8, #009c97)`
- **Text color:** `bg-deep` (`#171e21`) — dark text on bright background
- **Font:** 14–15px, weight 600, letter-spacing 0.3px
- **Padding:** 12–14px vertical, 22–28px horizontal
- **Border-radius:** `radius-sm` (8px)
- **Hover:** translateY(-1px) + intensified cyan glow shadow
- **Active:** translateY(0)
- **Disabled:** opacity 0.6, no transform

#### Ghost Button
- **Background:** `rgba(63, 84, 94, 0.4)` with `backdrop-filter: blur(8px)`
- **Text color:** `text` (`#e8edef`)
- **Hover:** background opacity increases to 0.6

#### Icon Button (circular)
- **Size:** 40–44px
- **Border-radius:** 50%
- **Background:** `rgba(43, 57, 64, 0.7)` or `rgba(63, 84, 94, 0.3)` with blur
- **Border:** 1px solid `rgba(63, 84, 94, 0.4)`
- **Hover:** border-color → cyan, scale(1.05)
- **Active:** scale(0.95)

#### Pill / Toggle Button
- **Padding:** 4px 14px
- **Border-radius:** 20px
- **Inactive:** `rgba(63, 84, 94, 0.3)` bg, `text-dim` color, 1px border
- **Active:** `rgba(0, 207, 200, 0.12)` bg, `cyan` color, cyan-tinted border

### Cards

#### Poster Card
- **Width:** 180px flex basis (grid: 170px min)
- **Poster aspect ratio:** 2:3
- **Poster background (empty):** `linear-gradient(160deg, #1e3340, #2a4858)`
- **Border-radius:** `radius` (12px)
- **Hover:** translateY(-6px) scale(1.02)
- **Play overlay:** 48px circle, `rgba(0, 207, 200, 0.9)`, revealed on hover with scale animation

#### Continue Watching Card
- **Width:** 320px flex basis
- **Background:** `bg-surface`
- **Border:** 1px solid `rgba(63, 84, 94, 0.3)`
- **Thumbnail height:** 160px
- **Progress bar:** 3px tall, cyan fill at bottom of thumbnail
- **Hover:** translateY(-5px) scale(1.01), border-color goes cyan-tinted

#### Session Card
- **Full-width stacked layout**
- **Background:** `bg-surface`
- **Border-radius:** `radius` (12px)
- **Hover:** cyan-tinted border, subtle box shadow
- **Status badges:** Pill-shaped, color-coded (green for playing, yellow for paused)

#### Activity/Stat Card
- **Background:** `bg-surface`
- **Border-radius:** `radius` (12px)
- **Layout:** Icon (44px rounded square) + text (value + label)
- **Icon backgrounds:** Color-coded at 12% opacity (cyan, blue, amber)
- **Hover:** translateY(-3px), elevated shadow

### Inputs

- **Background:** `rgba(23, 30, 33, 0.7)`
- **Border:** 1px solid `rgba(63, 84, 94, 0.6)`
- **Border-radius:** `radius-sm` (8px)
- **Padding:** 12px 16px
- **Font:** 15px, inherit family
- **Placeholder color:** `rgba(148, 163, 171, 0.5)`
- **Focus:** border-color → `cyan`, box-shadow → `0 0 0 3px rgba(0, 207, 200, 0.15)`

### Search Box

- **Shape:** Pill (border-radius 28px)
- **Background:** `rgba(43, 57, 64, 0.7)` + `backdrop-filter: blur(12px)`
- **Width:** 260–280px, expanding to 320–340px on focus
- **Focus:** cyan border + subtle cyan glow ring

### Tables

- **Container:** `bg-surface` with 1px border, `radius` border-radius
- **Header:** Uppercase, 12px, weight 600, letter-spacing 0.5px, `text-dim` color, dark bg overlay
- **Rows:** 14px text, 14–20px padding, subtle border-bottom
- **Hover:** Subtle background highlight

### Modal

- **Overlay:** `rgba(0, 0, 0, 0.6)` + `backdrop-filter: blur(4px)`
- **Panel:** `bg-deep` background, 1px border, `radius` border-radius
- **Shadow:** `0 24px 64px rgba(0, 0, 0, 0.4)`
- **Entry animation:** fadeInScale (opacity + scale from 0.95)

### Chips / Tags

- **Padding:** 5px 12px (regular), 4px 10px (small)
- **Background:** `rgba(63, 84, 94, 0.35)`
- **Border:** 1px solid `rgba(63, 84, 94, 0.4)`
- **Border-radius:** 20px (pill shape)
- **Font:** 12px weight 500, or 11px weight 600
- **Hover:** Slightly increased background and border opacity

### Progress Bars

- **Track height:** 3–4px (6px on hover for player)
- **Track background:** `rgba(255, 255, 255, 0.1–0.35)`
- **Fill color:** `cyan` (`#00CFC8`)
- **Fill glow:** `box-shadow: 0 0 6px rgba(0, 207, 200, 0.3)`
- **Thumb (player):** 14px cyan circle with cyan glow, visible on hover

### Navigation Sidebar

- **Background:** `rgba(23, 30, 33, 0.92)` + `backdrop-filter: blur(20px)`
- **Right border:** 1px solid `rgba(63, 84, 94, 0.35)`
- **Nav button (default):** transparent bg, `text-dim` color
- **Nav button (hover):** `rgba(63, 84, 94, 0.35)` bg, scale(1.05)
- **Nav button (active):** `rgba(0, 207, 200, 0.1)` bg, `cyan` color, 3px cyan left indicator bar
- **Active indicator:** 3px wide, 20px tall, cyan, positioned at left edge, rounded right corners

### Avatar

- **Size:** 34px circle
- **Background:** `linear-gradient(135deg, cyan, teal)`
- **Text:** 13px, weight 600, `bg-deep` color
- **Content:** User initials (1–2 characters)

### Badges

- **New badge:** `cyan` bg, `bg-deep` text, 10px uppercase bold, 4px radius
- **Notification badge:** `cyan` bg, black text, 16px height pill, animated with pop-in
- **Status badges:** Pill-shaped, 12px uppercase bold, color-coded backgrounds at 12% opacity
- **4K badge:** Semi-transparent black bg with blur, white text, border with 15% white

---

## 7. Iconography

- **Style:** Outlined / stroke-based (Lucide / Feather style)
- **Stroke width:** 2px (default), 1.5px (lighter variant)
- **ViewBox:** 24x24
- **Line caps:** Round
- **Line joins:** Round
- **Default color:** `currentColor` (inherits from parent text color)
- **Size conventions:** 
  - Navigation: 22px
  - Action buttons: 18–20px
  - Inline/small: 14–16px
  - Empty state: 64px

---

## 8. Animations & Motion

### Easing Curves

| Token           | Curve                                | Usage                     |
| --------------- | ------------------------------------ | ------------------------- |
| `ease-out-expo` | `cubic-bezier(0.16, 1, 0.3, 1)`     | Primary entrances, layout |
| `ease-out`      | `cubic-bezier(0.25, 0.46, 0.45, 0.94)` | General transitions    |

### Entry Animations

| Animation      | Description                              | Duration | Delay Pattern           |
| -------------- | ---------------------------------------- | -------- | ----------------------- |
| `fadeIn`        | Simple opacity 0 → 1                   | 0.2–0.4s | —                       |
| `fadeInUp`      | Opacity 0 → 1, translateY(20px) → 0    | 0.5–0.8s | Staggered: 0.05s steps  |
| `fadeInScale`   | Opacity 0 → 1, scale(0.95) → 1         | 0.2–0.35s| Modals, dropdowns       |
| `shimmer`       | Background gradient sweep               | 8s       | Looping, ease-in-out    |
| `badge-pop`     | Scale 0 → 1.2 → 1 with opacity         | 0.3s     | On badge appearance     |

### Micro-interactions

- **Button hover:** translateY(-1px) + shadow intensification, 0.15s
- **Button active:** translateY(0), instant
- **Card hover:** translateY(-3px to -6px) + scale(1.01–1.02), 0.3s ease-out
- **Nav button hover:** scale(1.05), 0.2s
- **Nav button active:** scale(0.95)
- **Focus rings:** 3px cyan glow via box-shadow, 0.2s transition
- **Image load:** Opacity 0 → 1 with 0.4s ease-out transition
- **Episode card hover:** translateX(6px) — slides right

### Staggered List Animation

Sections and cards animate in with incremental delays:
```
section:nth-child(2) → 0.05s delay
section:nth-child(3) → 0.10s delay
section:nth-child(4) → 0.15s delay
section:nth-child(5) → 0.20s delay
```

---

## 9. Ambient Effects

### Background Glow

Pages feature subtle radial gradient glows in the background:
- **Top-left:** `radial-gradient(circle, rgba(0, 207, 200, 0.08), transparent 70%)` — large, 80vw
- **Bottom-right:** `radial-gradient(circle, rgba(3, 255, 246, 0.05), transparent 70%)` — 60vw

### Hero Section

- **Height:** 480–540px
- **Background gradient:** `linear-gradient(170deg, #1a3a4a 0%, #0d1518 100%)`
- **Bottom fade:** Gradient overlay fading into `bg-deep`
- **Left text protection:** Horizontal gradient from opaque `bg-deep` to transparent
- **Shimmer effect:** Slow-moving gradient highlight (8s loop)

### Poster Empty State

- **Background:** `linear-gradient(160deg, #1e3340, #2a4858)` — dark teal gradient placeholder

### Backdrop (Detail Pages)

- **Height:** 480px
- **Empty gradient:** `linear-gradient(135deg, #0f2a36 0%, #1a3848 40%, #0d1518 100%)`
- **Image opacity:** 0.7 (dimmed for readability)
- **Bottom fade:** 320px gradient into `bg-deep`

---

## 10. Logo & Branding

### Logo Variants Available

| Variant               | Description                                      |
| --------------------- | ------------------------------------------------ |
| `logo-square`         | Square mark only (used in sidebar: 36x36)        |
| `logo-sbs`            | Side-by-side: mark + wordmark                    |
| `logo-stacked`        | Stacked: mark on top, wordmark below             |
| `logo-box-sbs`        | Boxed side-by-side                               |
| `logo-box-stacked`    | Boxed stacked                                    |

Each variant is available in these color modes:
- **Default** — Brand colors (cyan on transparent)
- **White** — White on transparent
- **Black** — Black on transparent
- **Background** (`-bg`) — Brand colors on dark background

File formats: SVG + PNG. Padded PNG variants (`-padded`) also available.

### Logo Usage

- **Sidebar:** `logo-square.svg`, 36x36px
- **Login screen:** Side-by-side or stacked variant, ~48px height, centered
- **Favicon / app icon:** Square variant

---

## 11. Responsive Patterns

### Content Width

- Pages do not use a fixed max-width container; content fills available space with consistent 60px horizontal padding
- Poster grids use `auto-fill` with `minmax(170px, 1fr)` for fluid responsive behavior
- Media rows use horizontal scrolling rather than wrapping

### Recommended Breakpoints

Content adapts primarily through flexible grids, but consider:
- Reducing horizontal padding from 60px to 24px on smaller screens
- Switching poster grids to 2 or 3 columns on compact layouts
- Collapsing sidebar to bottom navigation on mobile

---

## 12. Key Design Principles

1. **Dark-first:** The entire UI is built on a dark palette. Never use light/white backgrounds.
2. **Cyan-accented:** The cyan/teal gradient is the sole brand accent. Use it sparingly for primary actions, active states, and emphasis.
3. **Depth through transparency:** Surfaces use semi-transparent backgrounds with backdrop blur to create layered depth rather than flat solid colors.
4. **Subtle motion:** All interactions have gentle micro-animations. Hover lifts (translateY), scale nudges, and staggered fade-ins create a polished feel without being distracting.
5. **Generous whitespace:** Sections breathe with 48px gaps, 60px padding, and consistent spacing.
6. **Progressive disclosure:** Play overlays, version pickers, and details reveal on hover/interaction.
7. **Consistent rounding:** 12px for major containers, 8px for interactive elements, full pill for small badges and search.

---

## Flutter Implementation Notes

### Mapping CSS Variables to Flutter

```dart
class AstriaColors {
  static const bgDeep = Color(0xFF171E21);
  static const bgSurface = Color(0xFF2B3940);
  static const bgCard = Color(0xFF3F545E);
  static const cyan = Color(0xFF00CFC8);
  static const cyanBright = Color(0xFF03FFF6);
  static const teal = Color(0xFF009C97);
  static const text = Color(0xFFE8EDEF);
  static const textDim = Color(0xFF94A3AB);

  // Semantic
  static const error = Color(0xFFDC2626);
  static const errorText = Color(0xFFFCA5A5);
  static const success = Color(0xFF4ADE80);
  static const warning = Color(0xFFFFB432);
  static const info = Color(0xFF3898EC);
}

class AstriaRadii {
  static const radius = 12.0;
  static const radiusSm = 8.0;
  static const pill = 20.0;
}
```

### Theme Setup

```dart
ThemeData astriaTheme = ThemeData(
  brightness: Brightness.dark,
  scaffoldBackgroundColor: AstriaColors.bgDeep,
  fontFamily: 'Inter',
  colorScheme: ColorScheme.dark(
    primary: AstriaColors.cyan,
    secondary: AstriaColors.teal,
    surface: AstriaColors.bgSurface,
    error: AstriaColors.error,
  ),
  textTheme: TextTheme(
    headlineLarge: TextStyle(fontSize: 42, fontWeight: FontWeight.w700, letterSpacing: -0.5, color: AstriaColors.text),
    headlineMedium: TextStyle(fontSize: 28, fontWeight: FontWeight.w700, letterSpacing: -0.3, color: AstriaColors.text),
    titleLarge: TextStyle(fontSize: 22, fontWeight: FontWeight.w600, color: AstriaColors.text),
    titleMedium: TextStyle(fontSize: 20, fontWeight: FontWeight.w600, color: AstriaColors.text),
    bodyLarge: TextStyle(fontSize: 15, fontWeight: FontWeight.w400, height: 1.6, color: AstriaColors.text),
    bodyMedium: TextStyle(fontSize: 14, fontWeight: FontWeight.w400, color: AstriaColors.text),
    bodySmall: TextStyle(fontSize: 13, fontWeight: FontWeight.w500, letterSpacing: 0.3, color: AstriaColors.textDim),
    labelSmall: TextStyle(fontSize: 11, fontWeight: FontWeight.w600, letterSpacing: 0.5, color: AstriaColors.textDim),
  ),
  cardTheme: CardThemeData(
    color: AstriaColors.bgSurface,
    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
    elevation: 0,
  ),
  elevatedButtonTheme: ElevatedButtonThemeData(
    style: ElevatedButton.styleFrom(
      foregroundColor: AstriaColors.bgDeep,
      padding: EdgeInsets.symmetric(horizontal: 28, vertical: 14),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
      textStyle: TextStyle(fontSize: 15, fontWeight: FontWeight.w600, letterSpacing: 0.3),
    ),
  ),
  inputDecorationTheme: InputDecorationTheme(
    filled: true,
    fillColor: AstriaColors.bgDeep.withValues(alpha: 0.7),
    border: OutlineInputBorder(
      borderRadius: BorderRadius.circular(8),
      borderSide: BorderSide(color: AstriaColors.bgCard.withValues(alpha: 0.6)),
    ),
    focusedBorder: OutlineInputBorder(
      borderRadius: BorderRadius.circular(8),
      borderSide: BorderSide(color: AstriaColors.cyan),
    ),
    contentPadding: EdgeInsets.symmetric(horizontal: 16, vertical: 12),
  ),
);
```

### Primary Button Gradient

Since Flutter's `ElevatedButton` doesn't natively support gradients, use a `Container` with `BoxDecoration`:

```dart
Widget astriaPrimaryButton({required String label, VoidCallback? onTap}) {
  return InkWell(
    onTap: onTap,
    borderRadius: BorderRadius.circular(8),
    child: Container(
      padding: EdgeInsets.symmetric(horizontal: 28, vertical: 14),
      decoration: BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [AstriaColors.cyan, AstriaColors.teal],
        ),
        borderRadius: BorderRadius.circular(8),
        boxShadow: [
          BoxShadow(color: AstriaColors.cyan.withValues(alpha: 0.25), blurRadius: 16, offset: Offset(0, 4)),
        ],
      ),
      child: Text(label, style: TextStyle(color: AstriaColors.bgDeep, fontSize: 15, fontWeight: FontWeight.w600)),
    ),
  );
}
```

### Easing Curves

```dart
// ease-out-expo: cubic-bezier(0.16, 1, 0.3, 1)
const astriaEaseOutExpo = Cubic(0.16, 1, 0.3, 1);

// ease-out: cubic-bezier(0.25, 0.46, 0.45, 0.94)
const astriaEaseOut = Cubic(0.25, 0.46, 0.45, 0.94);
```
