# Hand-rolled springs instead of a motion library

Gesture-driven motion (the timeline's scrub and pager, and future drags) uses the small spring engine in `app/actions/public/motion.ts` (`Value`, the `SPRING` presets, the velocity `tracker`, `rubber`) rather than a motion library. Remix 3 components aren't React, so React motion libraries don't apply. CSS transitions can't be seeded with a finger's release velocity or retargeted mid-flight without a jump, and the Apple-style feel OTP wants depends on both.

## Consequences

- New gesture code should build on `motion.ts` rather than adding its own physics. The sheet's drag still has its own rubber band and velocity code, and that is debt to fold in, not a precedent.
- Reduced motion is handled inside `motion.ts`, so motion built on it gets that for free.
