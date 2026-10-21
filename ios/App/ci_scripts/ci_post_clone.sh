#!/bin/sh
# Xcode Cloud runs this after cloning. The iOS project needs what git doesn't
# hold: node_modules (CapApp-SPM's packages point into it), the web bundle and
# capacitor.config.json. Build them before Xcode resolves the packages.
set -e

export HOMEBREW_NO_AUTO_UPDATE=1
brew install node

cd "$CI_PRIMARY_REPOSITORY_PATH"
npm ci
npm run build
npm run cap:ios
