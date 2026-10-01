# Live updates

The native apps ship the web app inside the APK/IPA. Live updates let them
pick up a newer web bundle (HTML, CSS, JS) from our own static server without
a store release. Native changes (Java/Swift, `AndroidManifest.xml`,
`Info.plist`, Capacitor plugins) still need a store release.

Plugin: [`@capawesome/capacitor-live-update`](https://github.com/capawesome-team/capacitor-plugins/tree/main/packages/live-update) (MIT), self-hosted, no Capawesome Cloud.

## How it works

1. After the first page renders, `NativeShellService` calls
   `LiveUpdateService.readyAndCheck()`:
   - `ready()` tells the plugin this bundle works. A bundle that does not
     render a page within `readyTimeout` (10 s) is rolled back to the one
     shipped in the app and blocked; the check skips blocked bundles, so a
     broken bundle is tried once. Publish a fixed one with a newer build.
   - It fetches `<base>/<platform>/<channel>/manifest.json`.
   - If the manifest's `bundleId` is newer than the running bundle's
     `build-info.json` `buildVersion`, it downloads the zip and sets it as the
     next bundle. It never moves backwards, so a store release newer than the
     channel's bundle keeps its own.
2. The new bundle applies on the next app launch, so reading is never
   interrupted.
3. The plugin rejects any zip whose SHA256withRSA signature does not match
   `live-update-public.pem` (set as `publicKey` in `capacitor.config.ts`).

`<base>` is `appConfig.liveUpdateBaseUrl` in `src/app/config.ts`. Empty
disables live updates.

## Channels: `native-<n>`

A bundle must only reach apps whose native code it was built against: a
bundle calling a plugin method that an older APK lacks would break that APK.
The channel is set at build time in both native projects:

- `android/app/build.gradle`: `resValue ... "capawesome_live_update_default_channel", "native-1"`
- `ios/App/App/Info.plist`: `CapawesomeLiveUpdateDefaultChannel` = `native-1`

**Bump `<n>` in both whenever native code or plugins change**, in the same
change that ships the native release. `npm run live-update:package` fails if
the two disagree.

## Publishing

Run the **Publish Live Update** workflow (`.github/workflows/live-update.yml`)
from the commit to publish. It builds the web app, packages and signs it
(`npm run live-update:package`), and uploads it over SSH with rsync: zips
first, manifests last.

Layout on the server:

```
<root>/android/native-1/manifest.json
<root>/android/native-1/20261001-203100Z.zip
<root>/ios/native-1/manifest.json
<root>/ios/native-1/20261001-203100Z.zip
```

Old zips are not deleted; prune them by hand once no device can need them.

### Secrets

| Secret | Value |
| --- | --- |
| `LIVE_UPDATE_SIGNING_KEY` | PEM RSA private key matching `live-update-public.pem` |
| `LIVE_UPDATE_SSH_KEY` | Private SSH key of a deploy user on the server |
| `LIVE_UPDATE_SSH_KNOWN_HOSTS` | `ssh-keyscan <host>` output, verified by hand |
| `LIVE_UPDATE_SSH_TARGET` | rsync destination, e.g. `deploy@host:/var/www/live-updates` |

To rotate the signing key: generate a new pair, commit the new public key,
and ship a store release. Installed apps only trust the key they were built
with, so they stop receiving updates until they install that release.

```bash
openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:3072 -out live-update-signing-key.pem
openssl pkey -in live-update-signing-key.pem -pubout -out live-update-public.pem
```

## nginx

The manifest is fetched by the web view (from `https://localhost` on Android,
`capacitor://localhost` on iOS), so it needs CORS. The zip is downloaded by
native code and does not.

```nginx
server {
    listen 443 ssl;
    server_name updates.example.org;
    root /var/www/live-updates;

    location ~ /manifest\.json$ {
        add_header Cache-Control "no-store" always;
        add_header Access-Control-Allow-Origin "*" always;
    }

    # Each zip has a unique name and never changes.
    location ~ \.zip$ {
        add_header Cache-Control "public, max-age=31536000, immutable" always;
    }

    location / {
        return 404;
    }
}
```
