# Mummy's Game Hub 💗

A tiny GitHub Pages multiplayer site with:

- 6-character room codes
- 2-player rooms
- live room chat
- shared Snakes & Ladders
- host reset button
- mobile-friendly layout

## 1. Put this on GitHub

Create a repository (for example `mummy-game-hub`) and upload all the files in this folder.

Keep `index.html` in the top/root of the repository.

## 2. Create the Firebase project

This site uses Firebase Authentication + Realtime Database so two browsers can see the same room.

In the Firebase console:

1. Create a Firebase project.
2. Add a **Web app** to the project.
3. Copy the web app's `firebaseConfig`.
4. Open `firebase-config.js` and replace the `PASTE_YOURS_HERE` values with your config.

The Firebase browser config is expected to be visible in a website. Never put a service account JSON file, Admin SDK private key, or other secret admin credentials in GitHub.

## 3. Turn on Anonymous Authentication

Firebase Console → Authentication → Sign-in method → Anonymous → Enable.

This gives each browser a temporary Firebase user ID without making Mummy create an account.

## 4. Create Realtime Database

Firebase Console → Realtime Database → Create database.

Then open the database **Rules** tab and use the contents of `database.rules.json`.

These starter rules require a Firebase-authenticated browser and limit chat messages to 200 characters. They are suitable for a small family prototype, not a public large-scale chat service.

## 5. Turn on GitHub Pages

In the GitHub repository:

Settings → Pages → Deploy from a branch → `main` → `/ (root)`.

GitHub will give you a Pages URL.

## How rooms work

- Host presses **Create room** and gets a 6-character code.
- Second player enters their name and the code.
- Once two players are present, the shared Snakes & Ladders game starts.
- Only the player whose turn it is can roll.
- Chat is synchronized through Firebase Realtime Database.
- If the host leaves, the room is deleted.

## Important notes

- A room code is a convenience code, not a strong password.
- Anyone who knows/guesses a room code could potentially access that room while it exists.
- Avoid private information in chat.
- This prototype trusts clients for game actions and is intended for friendly/family play, not competitive or prize-based play.

## Files

- `index.html` — site structure
- `styles.css` — appearance
- `app.js` — rooms, chat, and game logic
- `firebase-config.js` — paste Firebase web config here
- `database.rules.json` — starter Realtime Database security rules
