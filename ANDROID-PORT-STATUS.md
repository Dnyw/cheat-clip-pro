# Cheat Clip Pro Android Hybrid Port

This branch is the Android packaging and adaptation workspace for the upstream Cheat Clip Pro project.

## Current stage

- [x] Preserve the upstream React/Vite source and original MIT license.
- [x] Add Capacitor app configuration.
- [x] Add a GitHub Actions workflow that packages the current web frontend into a debug APK.
- [ ] Audit frontend API calls and separate browser-only/server-dependent features.
- [ ] Implement Android local video selection through the Android file picker.
- [ ] Implement local video preview and local trim/export.
- [ ] Route only compact analysis inputs to Gemini; do not upload the original video by default.
- [ ] Test on physical Android devices.

## Important limitation

The first APK build is a packaging baseline only. The upstream project has a Python FastAPI backend and server-side media endpoints. Packaging the React frontend does not make those backend features run locally on Android, and it does not yet make video import, analysis, rendering, or export fully local.

The Android port must replace the relevant upload/render API paths with local browser/Capacitor media handling before it can meet the offline-import requirement.

## Build

Run the Build Cheat Clip Pro Android APK workflow from the Actions tab. The debug APK is published as a workflow artifact.

## Attribution

This project is based on the upstream Cheat Clip PRO repository and retains its original MIT LICENSE file and attribution.
