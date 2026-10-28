# GUBS Online

An online, multiplayer tabletop version of **GUBS: A Game of Wit and Luck** (Gamewright).
Play it in the browser with 2-6 players: friends, bots, or both.

- Create a table, share the link or 4-letter code, and add bots for empty seats
- A server enforces the full rules: all 70 cards, Interrupts on other players' turns, Events, Letters and tiebreaks
- Interrupt windows: when someone plays a Hazard or Trap, anyone holding a Feather, Blindfold or Cricket Song gets a prompt to cancel it. Flop Boat and Age-Old Cure prompts appear when Events are drawn.
- Reconnects automatically if you refresh. If a player stays disconnected, a bot plays their turns until they return.
- Works on desktop and phones; includes game log and chat

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
- Smahl Thief steals a whole Gub stack, together with any Barricade or Sud Spout on it.
- Retreat takes back your untrapped Gubs together with their Barricades.
- Traveling Merchant: each player keeps one card and passes the rest to the player on their right, the previous player in turn order.
- Flop Boat can't stop Letter cards.
- Interrupts can't be interrupted.

## Project layout

```
shared/cards.js    card list (names, counts, text), used by server and browser
server/engine.js   authoritative rules engine
server/bot.js      heuristic bot player
server/index.js    static file server + WebSocket rooms
public/            browser client (index.html, style.css, client.js, cards/)
test/              rules tests and bot-vs-bot simulation
```

## Card art

`public/cards/` holds the real cards, cut exactly as they appear in a scan of a physical deck (no retouching). `tools/crop_cards.py` rebuilds them from a scan laid out as a 10 x 7 grid. GUBS and its artwork are © Gamewright; this is an unofficial fan project for personal play.
