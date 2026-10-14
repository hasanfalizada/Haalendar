# Haalendar — Design System v1.0

+++===+++ 2026-10-14 — Hasan Alizada — HAAL-018. Approved by owner 2026-10-14 together with the wireframes (decisions in section 11). Visual reference: design/wireframes.html (published as a private artifact). Implemented in the frontend as Tailwind v4 theme tokens + shadcn/ui components (HAAL-017).

## 1. Principles
1. **Content colors belong to the user, chrome is calm.** UI uses teal and neutrals; the 8 event colors appear only on user items.
2. **Keyboard first, touch equal.** Every action has a keyboard path (section 7) and a ≥ 44 × 44 px touch target.
3. **Nothing happens silently.** Every write shows a result toast; destructive actions offer Undo (FR-X-05, FR-X-06).
4. **Never lose work.** Unsaved-changes guard, offline queue with visible state (FR-X-09, FR-OFF-*).
5. **Accessible by default.** WCAG 2.2 AA, visible focus, `prefers-reduced-motion`, color is never the only signal (icons, labels).

## 2. Color tokens
Brand values from `design/brand-guidelines.md`. Neutrals have a slight teal bias.

| Token | Light | Dark | Use |
|---|---|---|---|
| `bg` | `#FFFFFF` | `#0B1220` | Page, dialogs, cards |
| `surface` | `#F5F8F8` | `#111A27` | Rail, sidebars, Kanban columns |
| `surface-2` | `#EAF0F0` | `#18232F` | Badges, placeholders |
| `line` | `#D9E2E2` | `#253243` | Borders, dividers |
| `fg` | `#111827` | `#EEF2F6` | Text |
| `muted` | `#56636F` | `#9AA7B4` | Secondary text, icons |
| `primary` | `#0F766E` | `#2DD4BF` | Primary buttons, active state, focus ring |
| `primary-hover` | `#115E59` | `#5EEAD4` | Hover/pressed |
| `primary-ink` | `#FFFFFF` | `#0B1220` | Text on primary |
| `primary-tint` | `#E6F6F3` | `#0F2E2B` | Selection, active nav |
| `accent` | `#F59E0B` | `#FBBF24` | Highlights, search marks — never as text background with white text |
| `danger` | `#B42318` | `#F97066` | Delete, overdue, errors |
| `ok` | `#15803D` | `#4ADE80` | Success states |
| `warn-bg` / `warn-fg` | `#FEF3C7` / `#78350F` | `#3A2A08` / `#FDE68A` | Overdue counter, offline banner, duplicate warning |

**Event colors** (FR-X-13): red `#DC2626`, orange `#EA580C`, yellow `#EAB308`, green `#16A34A`, blue `#2563EB`, purple `#9333EA`, brown `#92400E` (default), black `#1F2937` (dark theme `#9CA3AF`).
Rendering rule: an event is a **tint (13–18 % of the color mixed into `bg`) + 4 px left bar** in the full color; text stays `fg`. Text contrast is therefore independent of the event color (legacy used white text on saturated fills, which fails AA for yellow, orange and green).

## 3. Typography
- Typeface: **Inter** (SIL OFL), weights 400/500/600/700; tabular numbers for times, dates, counters. Monospace: JetBrains Mono (keyboard hints, IDs).
- Scale (px / weight / line-height): Title 24/600/1.25 · Heading 18/600/1.3 · Subheading 15/600 · Body 14/400/1.5 · Small 12.5/400 · Label 11/600 uppercase +0.06em.
- Running text max ~68 characters per line (descriptions, notes).

## 4. Spacing, radius, elevation, motion
- Spacing scale (4 px base): 2, 4, 6, 8, 10, 12, 14, 16, 20, 24, 32, 40, 48.
- Radius: `sm` 6 (controls, chips), `md` 10 (cards, popovers), `lg` 16 (dialogs, sheets, frames), full (pills, avatars).
- Elevation: flat by default; one shadow level for popovers/dialogs/toasts; dragged card adds a 2° tilt.
- Motion: 150 ms (hover, toggles), 250 ms (dialogs, drawer, sheets), ease-out; disabled under `prefers-reduced-motion`.

## 5. Layout and breakpoints
| Breakpoint | Width | Shell |
|---|---|---|
| Mobile | < 768 | Top bar + slide-out drawer (approved D-10), floating New button, swipe between periods, editors as full-screen sheets, Kanban one column at a time |
| Tablet | 768–1023 | Icon rail + collapsible sidebar (overlay) |
| Desktop | ≥ 1024 | Icon rail (56) + sidebar (248, collapsible) + main |

Shell regions: rail (modules Calendar / To-Do / Kanban, then Trash, Notifications, Account), module sidebar, module header (navigation, view switch, search), content. Offline/demo banners sit above the header.

## 6. Components (shadcn/ui based)
| Group | Components |
|---|---|
| Base (shadcn) | Button (primary / secondary / ghost / danger / icon), Input, Textarea, Select, Combobox, Checkbox, Switch, RadioGroup, SegmentedControl (Tabs), Badge, Avatar, Tooltip, Kbd, Skeleton, ScrollArea, Separator |
| Overlays | Dialog, AlertDialog (delete, unsaved changes), Sheet (mobile editors, drawer), Popover (event details), DropdownMenu, ContextMenu (right-click), Command (palette, cmdk) |
| Feedback | Toast (Sonner) with Undo action, Banner (offline, demo reset, sync error), SyncStatus indicator, EmptyState, NotificationBell + center |
| Date/time | MiniMonth (with ISO week numbers), DatePicker, TimeSelect (15-min steps), RecurrenceEditor (RRULE presets + custom), ReminderPicker, WeekLabel (week no · day no · Week A/B) |
| Calendar | EventChip (day/agenda), EventBlock (week grid, drag/resize), MonthCell (+N more), EventPopover, EventEditor, OverdueCounter, CalendarList (visibility, color), LayerToggles |
| To-Do | NoteCard (color, pin, labels, due, checklist progress), Checklist (reorder, checked to bottom), LabelPicker |
| Kanban | Board, Column (WIP indicator), Card (stripe, badges, assignees, progress), CardDetail, AssigneePicker, BoardFilters |
| Cross-cutting | ColorPicker (8 swatches), PrioritySelect, MarkdownEditor (write/preview, sanitized), AttachmentDropzone (picker, drag, paste) + Thumbnail, BulkActionBar, TrashList, HistoryList, LinkList |
| Icons | Lucide (shadcn default, ISC licence), 16/20 px, stroke 2 |

## 7. Interaction patterns
- **Selection**: click selects; Ctrl/Cmd-click toggles; Shift-click/Shift+arrows extend; long-press on touch enters selection mode; BulkActionBar appears at the bottom.
- **Result feedback**: one toast per write — success (auto-hide 4 s, Undo for destructive/move), failure (stays until dismissed, with reason and Retry), queued offline, synced.
- **Undo/redo**: Ctrl+Z / Ctrl+Shift+Z, 50 steps per session; toast Undo triggers the same command.
- **Unsaved changes**: AlertDialog "Discard changes?" with Keep editing (default focus) / Discard.
- **Delete**: AlertDialog for single delete via keyboard; bulk delete shows count; recurring events ask "This event / This and following / All events".
- **Duplicate title**: inline warning under the title field with a link to the existing event; saving still allowed.
- **Drag and drop**: mouse, touch (long-press) and keyboard (Space to pick up, arrows, Space to drop, Esc to cancel); live region announces position.
- **Empty states**: invite to create the first item, one sentence + primary action.

## 8. Keyboard map
| Keys | Action |
|---|---|
| Alt+1 / 2 / 3 | Calendar / To-Do / Kanban |
| Ctrl+K or / | Command palette, search, date jump (YYYY-MM-DD) |
| T | Today |
| ← / → (J / K) | Previous / next period |
| D / W / M / A | Day / Week / Month / Agenda |
| N | New item |
| E or Enter | Edit / open selected |
| Delete | Delete selected (confirmation) |
| Shift+N | Move selected to next day |
| ↑ / ↓, Shift+↑/↓, Ctrl+A | Focus, extend selection, select all |
| Ctrl+Z / Ctrl+Shift+Z | Undo / redo |
| Ctrl+Enter | Save editor |
| Esc | Close (guarded if unsaved) |
| 1–8 (in event popover) | Set color |
| ? | Shortcut list |
Single-key shortcuts are disabled while focus is in a text field.

## 9. Accessibility checklist (per component)
Visible focus ring (2 px `primary`, 2 px offset); roles and names for icon buttons; dialogs trap focus and return it; color + icon/text for every status (priority badge text, overdue icon); contrast AA verified for tokens in both themes; touch targets ≥ 44 px on touch devices; motion reduced when requested.

## 10. Screens covered by the wireframes
D1 calendar day view · D2 event popover · D3 event editor (duplicate warning, unsaved state) · D4 week view · D5 month view · D6 notes · D7 Kanban board · D8 command palette/search · D9 multi-select, undo toast, trash, offline banner · M1–M5 mobile day view, drawer, editor sheet, Kanban column, notes.

## 11. Owner decisions (2026-10-14)
1. Wireframes D1–D9 and M1–M5 approved without changes.
2. Events rendered as tint + 4 px color bar with dark text (replaces legacy full-color fills with white text).
3. Keyboard map in section 8 approved.
4. Toasts auto-hide after 4 s; Undo offered on destructive and move actions.
