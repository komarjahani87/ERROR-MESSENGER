# Error Messenger — Design System

## Direction & Layout

**Product.** A peer-to-peer desktop messenger where two or more people exchange messages over a direct WebRTC link. The server only brokers the handshake; conversation text never passes through it.

**Mood.** Night-watch control room: deep navy, quiet chrome, one confident blue signal. Premium, technical, calm. It must not feel like a neon cyberpunk toy, a generic admin dashboard, or a chat mockup with dead buttons.

**Defining visual idea.** A dark "signal console" shell: a narrow left rail of connection facts (room code, identity, peers) beside a wide, softly lit conversation stage. Status is always literal — a link badge says *Connected* only when a DataChannel is genuinely open.

**Reference.** Linear-style desktop density, reinterpreted with softer radii and a warmer neutral ramp; no copied branding or copy.

**Layout.** Fixed sidebar 320px + fluid stage. Max stage content width 820px, centered. Header 64px, composer sticky at the bottom. Section rhythm 24/32/48px. Breakpoints: `lg` 1024px keeps the two-column shell; below that the sidebar becomes a slide-over sheet and the header gains a menu button; hero copy stacks under 640px. Every layout keeps a 40px minimum touch target.

**Do.** Use the accent sparingly for primary actions, active conversation, and live indicators. Keep hairlines and diffuse shadows together, never both heavy. Use monospace only for room codes, peer IDs, and technical readings.

**Don't.** No purple gradients, no glow bloom, no animated gradient text, no glassmorphism stacked on glassmorphism, no fake typing bots or seeded conversations, no "Connected" before a channel is open.

## Tokens

**Color (dark, default).** Canvas `#080C18` (`--background: 224 47% 6%`), panel `#0E1424`, card `#121A2E`, raised hover `#1A2440`, border `#2A3554`, ink `#EAF0FA`, muted ink `#98A6C0`, accent `#4C7DF7`, accent strong `#6E9BFF`, success `#34D399`, warning `#F5B84C`, danger `#F2657A`. Accent is reserved for primary buttons, the active row, focus rings, and the live link badge.

**Color (light).** Canvas `#F4F6FB`, panel `#FFFFFF`, card `#FFFFFF`, border `#DDE3EF`, ink `#0C1220`, muted ink `#5A6782`, same accent. Light mode is a supported preference, not the default identity.

**Typography.** Roboto (300–700) for interface and body; Roboto Mono for codes and diagnostics; Libre Caslon Text only for the lobby's single editorial headline. Display 40/1.05/-0.02em 700; stage title 22/1.2 600; body 14/1.6 400; meta 11/1.4 500 uppercase tracking 0.14em; buttons 13 500.

**Spacing & shape.** Scale 4/8/12/16/24/32/48. Radii: shell 20px, cards 16px, inputs and buttons 12px, bubbles 14px with one 4px tail corner, avatars circular.

**Elevation.** `--shadow-sm` for chips, `--shadow-md` for cards, `--shadow-lg` for dialogs and the composer. Panels use a 1px border plus the smallest shadow; dialogs use border plus `--shadow-lg` and a dim overlay at 60% canvas.

## Shared Patterns & States

- **Rail.** Brand mark + wordmark, live status row, room code with copy, identity field, conversation list with online/offline groups, footer actions.
- **Link badge.** `Connected` (success dot + direct transport), `Connecting` (warning dot, pulsing), `Failed` (danger, retry action), `Offline` (muted).
- **Bubble.** Own messages accent-tinted and right aligned; peer messages card-surface left aligned; sender name, time, and delivery marks (`sent`, `delivered`) rendered as text with tooltips, never color alone.
- **Composer.** Auto-growing textarea, Enter sends, Shift+Enter newline, disabled with an explicit reason when the link is not open.
- **Empty states.** Explain the next action with a real control; never seed fake data.
- **Motion.** 120–220ms `cubic-bezier(0.2, 0.7, 0.2, 1)` for hover/press; 240ms fade-up for message entry; 400ms once-only shell reveal; pulsing dot 1.8s for connecting only. Motion is disabled by `prefers-reduced-motion` and by the in-app motion preference.
- **Accessibility.** AA contrast, visible 2px accent focus ring on every control, skip link to the conversation stage, `aria-live` status region, labelled icon buttons, keyboard-navigable conversation list.

## Media

No photography: this is an operational surface, and imagery would compete with status truth. Identity comes from the geometric brand mark (SVG, two offset brackets with an interruption), a faint radial glow behind the lobby headline, and a 1px dot-grid on the stage. No stock photos, no ASCII art.