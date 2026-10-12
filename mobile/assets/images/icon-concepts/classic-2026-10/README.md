# Classic Nexus Hub icon concepts

Review assets only. No app configuration or production icons changed.

Open `preview.html` in a browser to compare launcher concepts at large, 48px and 24px sizes, plus the companion UI set.

## Launcher concepts

- `navy-gold-monogram.png`: navy and champagne gold, classic monogram.
- `blue-linked-nexus.png`: cobalt and ivory, connected workspace symbol.
- `ivory-charcoal-compass.png`: ivory, charcoal and brass, classic compass.

These are design concepts. After selecting one, prepare platform-specific launcher, Android adaptive foreground/background, monochrome and splash assets before activation.

## UI icons

12 original editable SVGs in `ui/`: home, work, projects, chat, inbox, calendar, notification, profile, search, attachment, send, more. They share a 24px grid, rounded 1.75px strokes, transparent backgrounds and `currentColor`. React Native integration can use the existing react-native-svg dependency after review.
