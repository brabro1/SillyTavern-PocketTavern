## What does this change?

**Layout:** Phone / Desktop / Both

## How did you check it?

- [ ] `cd tests && npm run check` passes
- [ ] Follows `DESIGN.md` (tokens, shapes, 44px touch targets, one way to each place)
- [ ] Ran the tests for the area against a test SillyTavern, and looked at phone and desktop screenshots (light and dark)
- [ ] Phone changes: `ios.mjs` in Chrome and WebKit
- [ ] Turning Pocket Tavern off still leaves native SillyTavern untouched
- [ ] New labels translated in every locale
- [ ] No personal data, chats or keys in the change
