#!/bin/sh
# Signs an unsigned Release archive for the App Store and packs it, with its
# symbols, as an IPA:
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

# A profile can list more than one certificate (the old and the new while
# one is renewed): sign with the first whose identity is in the keychain.
KEYCHAIN_IDENTITIES=$(security find-identity -v -p codesigning "$KEYCHAIN" |
  awk '{ print toupper($2) }')
IDENTITY=
INDEX=0
while CERT=$(plutil -extract "DeveloperCertificates.$INDEX" raw -o - "$WORK/profile.plist" 2> /dev/null); do
  SHA1=$(printf '%s' "$CERT" | base64 --decode | shasum -a 1 | cut -d ' ' -f 1 | tr 'a-f' 'A-F')
  if printf '%s\n' "$KEYCHAIN_IDENTITIES" | grep -qxF "$SHA1"; then
    IDENTITY=$SHA1
    break
  fi
  INDEX=$((INDEX + 1))
done
if [ -z "$IDENTITY" ]; then
  echo "None of the profile's $INDEX certificate(s) has a signing identity in $KEYCHAIN." >&2
  exit 1
fi

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

# Ship the archive's symbols in the IPA, as Xcode's export does when it uploads
# symbols, so App Store Connect and Organizer symbolicate crash reports.
# symbols skips an input it can't read and still exits 0, so check that every
# binary in the app got its file.
mkdir "$WORK/Symbols"
xcrun symbols -noTextInSOD -noDaemon -arch all -symbolsPackageDir "$WORK/Symbols" \
  "$ARCHIVE"/dSYMs/*.dSYM/Contents/Resources/DWARF/*
for binary in "$WORK/Payload/App.app/App" "$WORK"/Payload/App.app/Frameworks/*.framework; do
  if [ -d "$binary" ]; then
    binary="$binary/$(basename "$binary" .framework)"
  fi
  UUIDS=$(dwarfdump --uuid "$binary")
  for uuid in $(printf '%s\n' "$UUIDS" | cut -d ' ' -f 2); do
    if [ ! -f "$WORK/Symbols/$uuid.symbols" ]; then
      echo "No dSYM in $ARCHIVE/dSYMs matches $binary ($uuid)." >&2
      exit 1
    fi
  done
done

rm -f "$OUTPUT"
(cd "$WORK" && zip -qry App.ipa Payload Symbols)
mv "$WORK/App.ipa" "$OUTPUT"
