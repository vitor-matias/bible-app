#!/bin/sh
# Launches a simulator build of the app on the devices App Review uses, an
# iPhone 17 Pro Max and an iPad Air 11-inch (M3): a fresh install and launch,
# a trip to the background and back, a quit and a relaunch. Fails if the app
# is not running after any of them or has left a crash report, and copies the
# crash reports written meanwhile to LOG_DIR.
#
# Usage: smoke-launch.sh APP LOG_DIR
set -e

APP=$1
LOGS=$2
REPORTS=$HOME/Library/Logs/DiagnosticReports

# An unsigned build won't install on the simulator.
codesign --force --deep --sign - "$APP"
BUNDLE_ID=$(plutil -extract CFBundleIdentifier raw -o - "$APP/Info.plist")
EXECUTABLE=$(plutil -extract CFBundleExecutable raw -o - "$APP/Info.plist")

START=$(mktemp)
DEVICES=
cleanup() {
  mkdir -p "$LOGS"
  find "$REPORTS" -name '*.ips' -newer "$START" -exec cp {} "$LOGS" \;
  for UDID in $DEVICES; do
    xcrun simctl shutdown "$UDID" 2> /dev/null || true
    xcrun simctl delete "$UDID"
  done
  rm -f "$START"
}
trap cleanup EXIT

# Each on the newest runtime that offers it: some (27.2 24B91016s) offer
# only the iPhone Duo.
for TYPE in iPhone-17-Pro-Max iPad-Air-11-inch-M3; do
  TYPE=com.apple.CoreSimulator.SimDeviceType.$TYPE
  RUNTIME=$(xcrun simctl list runtimes -j | jq -r --arg type "$TYPE" '
    [.runtimes[] | select(.platform == "iOS" and .isAvailable and
      any(.supportedDeviceTypes[]; .identifier == $type))]
    | max_by(.version | split(".") | map(tonumber)) | .identifier // empty')
  if [ -z "$RUNTIME" ]; then
    echo "No available iOS runtime offers $TYPE." >&2
    exit 1
  fi
  UDID=$(xcrun simctl create "Smoke launch" "$TYPE" "$RUNTIME")
  DEVICES="$DEVICES $UDID"
  echo "$TYPE on $RUNTIME: $UDID"
done

for UDID in $DEVICES; do
  xcrun simctl boot "$UDID"
done
for UDID in $DEVICES; do
  xcrun simctl bootstatus "$UDID" > /dev/null
  xcrun simctl install "$UDID" "$APP"
done

launch() {
  for UDID in $DEVICES; do
    xcrun simctl launch "$UDID" "$1" > /dev/null
  done
}

# check WHEN SECONDS: waits, then fails unless the app is running on every
# device and has written no crash report.
check() {
  sleep "$2"
  for UDID in $DEVICES; do
    # Not grep -q: launchctl would die of a broken pipe, which simctl reports.
    if ! xcrun simctl spawn "$UDID" launchctl list | grep "^[0-9].*UIKitApplication:$BUNDLE_ID\[" > /dev/null; then
      echo "The app is not running on $UDID after $1." >&2
      exit 1
    fi
  done
  if [ -n "$(find "$REPORTS" -name "$EXECUTABLE-*.ips" -newer "$START")" ]; then
    echo "The app crashed by $1." >&2
    exit 1
  fi
  echo "Running after $1."
}

launch "$BUNDLE_ID"
check "the first launch" 30
launch com.apple.Preferences
sleep 5
launch "$BUNDLE_ID"
check "a trip to the background" 5
for UDID in $DEVICES; do
  xcrun simctl terminate "$UDID" "$BUNDLE_ID"
done
launch "$BUNDLE_ID"
check "a relaunch" 30
