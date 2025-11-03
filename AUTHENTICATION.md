# Authentication Flow Documentation

## Sign In (Sign In Button)

The app supports two authentication methods:

### 1. Farcaster Mini App (Mobile & Desktop in Warpcast)
- Automatic authentication on page load via Quick Auth SDK
- Manual authentication via Sign In button uses `farcasterSDK.getUserWithQuickAuth()`
- Detects Mini App environment via `checkMiniAppEnvironment()` (checks for window.farcaster, iframe, referrer)
- Stores session in localStorage with `fc_session` key
- Session format: `{ schemaVersion, farcaster: { fid, username, display_name, pfp_url }, miniapp: true }`

### 2. Wallet Authentication (Desktop browser only)
- Uses `signInWithWallet()` from `src/farcaster/auth.js`
- Requires `window.ethereum` (MetaMask, etc.)
- Signs SIWE-like message, fetches Farcaster profile via `getUserByAddress()`
- Session format: `{ schemaVersion, address, signature, farcaster: { fid, username, ... }, walletAuth: true }`

**Key Implementation Details:**
- `src/app.js` handles button click in `authBtn` event listener
- Checks if user already signed in before attempting new auth
- On mobile (outside Mini App), shows helpful message to use Warpcast
- Updates UI via `refreshUserLabel()` and `updateUIForMode()` after successful auth
- Clears `auto_auth_started` flag after successful authentication

## Sign Out (Sign Out Button)

When user clicks Sign Out button (same button, toggles based on `authBtn.dataset.signedIn`):

### Cleanup Process:
1. Stops match syncing via `stopSyncing()`
2. Clears current match via `clearCurrentMatch()`
3. Calls `signOut()` which removes:
   - `fc_session` from localStorage
   - `auto_auth_started` flag
4. Updates UI:
   - Calls `refreshUserLabel()` to reset button text and user label
   - Hides match timer (`timerContainer.style.display = "none"`)
   - Resets game board via `resetBoard(true)` (keeps score)
   - Calls `updateUIForMode()` to hide Farcaster-specific buttons

**Important:** Sign out should always clean up all session-related state and UI elements.

## Session Management

- Session stored in `localStorage.getItem("fc_session")`
- Validated via `getSession()` from `src/farcaster/auth.js`
- Session structure checked for `address` or `farcaster.fid` to determine auth status
- UI buttons (Invite Player, My Matches) shown only when `isFarcasterMode && isSignedIn`

## Mobile Device Handling

- Mobile browsers: Wallet auth not available, shows message to use Warpcast Mini App
- Mini App environment: Automatic auth on load, manual auth via Quick Auth
- Detection: User agent check + `checkMiniAppEnvironment()` + iframe/referrer checks
- Prevents false error messages during automatic authentication

