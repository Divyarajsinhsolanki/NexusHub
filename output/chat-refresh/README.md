# Chat refresh previews

These captures render the actual web Chat component with synthetic conversations and mocked network/realtime services. “Before” uses the repository's HEAD version of Chat and ChatTools; “after” uses the working implementation. The surrounding application shell is excluded.

| View | Before | After |
| --- | --- | --- |
| Desktop, 1440 × 900 | [Before](before-desktop.png) | [After](after-desktop.png) |
| Narrow web, 390 × 844 | [Before](before-narrow.png) | [After](after-narrow.png) |
| Dark theme, 1280 × 850 | [Before](before-dark.png) | [After](after-dark.png) |
| Floating chat | [Before](before-embedded.png) | [After](after-embedded.png) |

Menu previews: [desktop](after-desktop-menu.png), [narrow web](after-narrow-menu.png), [dark](after-dark-menu.png), [floating chat](after-embedded-menu.png).

Browser checks confirmed no horizontal page overflow at the captured sizes, 320px conversation-list width at 1440px, 300px at 1280px, and More menus within the visible chat bounds. Narrow web shows the selected conversation alone. The floating chat retains its bounded card.

Validation: the web chat/menu/tools interaction tests, adjacent chat suites, mobile chat/tools tests, TypeScript check, and Vite production build pass. Menu tests cover keyboard navigation, Escape focus restoration, outside dismissal, relocated tools, scheduling, and active-call joining.

Native iOS/Android rendering, device keyboards, and large-text settings still need a device or emulator check. These screenshots show responsive web, not native app screenshots. No authenticated live server was used.
