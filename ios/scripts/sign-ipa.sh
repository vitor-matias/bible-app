#!/bin/sh
# Signs an unsigned Release archive for the App Store and packs it as an IPA:
# what Xcode's export does, but through codesign --keychain, so the
# distribution certificate can sit in a keychain outside the search list (a
# CI runner's throwaway one, or a separate one on a developer's Mac).
#
# The team is an individual membership, where only the Account Holder may
# create certificates: Xcode's cloud signing is refused to everyone else, so
# the build is signed with the certificate and App Store profile he made.
#
# Usage: sign-ipa.sh ARCHIVE PROFILE KEYCHAIN OUTPUT_IPA
set -e

ARCHIVE=$1
PROFILE=$2
KEYCHAIN=$3
OUTPUT=$4

WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT

ditto "$ARCHIVE/Products/Applications/App.app" "$WORK/Payload/App.app"
cp "$PROFILE" "$WORK/Payload/App.app/embedded.mobileprovision"

# Sign with the profile's own certificate, and grant what the profile allows
# an App Store build of an app without capabilities.
security cms -D -i "$PROFILE" > "$WORK/profile.plist"
APP_ID=$(plutil -extract Entitlements.application-identifier raw -o - "$WORK/profile.plist")
TEAM_ID=$(plutil -extract TeamIdentifier.0 raw -o - "$WORK/profile.plist")
IDENTITY=$(plutil -extract DeveloperCertificates.0 raw -o - "$WORK/profile.plist" |
  base64 --decode | shasum -a 1 | cut -d ' ' -f 1 | tr 'a-f' 'A-F')

cat > "$WORK/entitlements.plist" << EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>application-identifier</key>
	<string>$APP_ID</string>
	<key>beta-reports-active</key>
	<true/>
	<key>com.apple.developer.team-identifier</key>
	<string>$TEAM_ID</string>
	<key>get-task-allow</key>
	<false/>
</dict>
</plist>
EOF

for framework in "$WORK"/Payload/App.app/Frameworks/*.framework; do
  codesign --force --sign "$IDENTITY" --keychain "$KEYCHAIN" --generate-entitlement-der "$framework"
done
codesign --force --sign "$IDENTITY" --keychain "$KEYCHAIN" \
  --entitlements "$WORK/entitlements.plist" --generate-entitlement-der \
  "$WORK/Payload/App.app"
codesign --verify --deep --strict "$WORK/Payload/App.app"

rm -f "$OUTPUT"
(cd "$WORK" && zip -qry App.ipa Payload)
mv "$WORK/App.ipa" "$OUTPUT"
