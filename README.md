# GUBS Online

An online, multiplayer tabletop version of **GUBS: A Game of Wit and Luck** (Gamewright).
Play it in the browser with 2-6 players: friends, bots, or both.

- Create a table, share the link or 4-letter code, and add bots for empty seats
- A server enforces the full rules: all 70 cards, Interrupts on other players' turns, Events, Letters and tiebreaks
- Interrupt windows: when someone plays a Hazard or Trap, anyone holding a Feather, Blindfold or Cricket Song gets a prompt to cancel it. Flop Boat and Age-Old Cure prompts appear when Events are drawn.
- Reconnects automatically if you refresh. If a player stays disconnected, a bot plays their turns until they return.
- 3D tabletop: a playmat on a wooden table, player nameplates, and a big spotlight whenever a card is played
- Bots-only mode that runs entirely in the browser (works on GitHub Pages)
- No menus: tap a card, then tap what it should hit (a Gub, a player, the deck or the discard pile); tap your Feather or Flop Boat itself to stop an attack
- Phone layout with big tap targets; can be added to the home screen
- Includes game log and chat

## Play on GitHub Pages (bots only)

The game runs entirely in the browser when you play against bots, so it works on GitHub Pages with no server.
Online tables with friends need the Node server below.

1. In the repository on GitHub: **Settings → Pages → Build and deployment → Source: Deploy from a branch**, branch `master`, folder `/ (root)`.
2. The site appears at `https://<your-user>.github.io/<repo>/` a minute after each push. The root `index.html` forwards to the game in `public/`.

On a phone, use **Add to Home Screen** (Safari: Share menu, Chrome: ⋮ menu) to play it full screen like an app.
A bots game is saved after every move, so if the phone reloads the page, tap **Resume your game**.

## Run it

```bash
npm install
npm start            # http://localhost:3000  (PORT=8080 npm start to change)
npm test             # rules tests + 1000 simulated bot games
```

To play with friends over the internet, deploy to any Node host that supports WebSockets (Render, Railway, Fly.io, a VPS…) with `npm start` as the start command.

## Rules summary

**Goal:** Have the most Free and/or Protected Gubs in play when the final letter of G-U-B is drawn.

**Setup:** Each player starts with one Gub in play (never the Esteemed Elder). The G, U and B cards go back into the deck, one near the top, one in the middle and one near the bottom. Everyone is dealt 3 cards. Events dealt this way are put back into the deck and replaced.

**Turn:**
1. **Draw** one card, or choose not to. You can't skip drawing two turns in a row, and you can't draw after playing cards.
2. **Play** as many cards as you like.
3. **Discard** down to 8 cards, then say "Go".

**End:** The game ends as soon as the third letter is drawn. Trapped Gubs and Gubs in hand don't score. Ties go to whoever has the Esteemed Elder in play, then to the player holding the fewest cards.

### How the rules are interpreted here
The printed card guide wasn't available, so a few calls are based on the card text:
- When you draw an Event or a Letter, it takes effect and you then draw a replacement card.
- Barricades only protect your own Free Gubs. Traps and Lures only affect Free Gubs. The Esteemed Elder can't be barricaded, trapped, lured, stolen, retreated, flooded or speared.
- Smahl Thief steals a Gub together with its Barricade; a Sud Spout on it is discarded, so the Gub arrives Free.
- Retreat takes any or all cards on your side back into your hand, including Sud Spouts opponents played there and your Rings with their Gubs.
- Traveling Merchant: each player keeps one card and passes the rest to the player on their right, the previous player in turn order.
- Letters count as Events: Flop Boat can send one back into the deck, even the third, so the game goes on.
- Interrupts can't be interrupted.

## Project layout

```
shared/cards.js    card list (names, counts, text)
shared/engine.js   rules engine (runs on the server for online tables, in the browser for bots games)
shared/bot.js      heuristic bot player
server/index.js    static file server + WebSocket rooms for online play
public/            browser client (index.html, style.css, client.js, cards/)
test/              rules tests and bot-vs-bot simulation
```

## Card art

`public/cards/` holds the real cards, cut exactly as they appear in a scan of a physical deck (no retouching). `tools/crop_cards.py` rebuilds them from a scan laid out as a 10 x 7 grid. GUBS and its artwork are © Gamewright; this is an unofficial fan project for personal play.
