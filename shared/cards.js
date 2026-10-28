// Card definitions shared by the server and the browser client.
(function (root) {
  // `text` explains the card in game; the card face shows `flavor` and `printed` (falls back to `text`).
  const CARDS = {
    // Letters (count as Events)
    letter_g: { name: 'G', type: 'letter', count: 1, text: 'Letter card. When the third letter is drawn, the game ends.', printed: '' },
    letter_u: { name: 'U', type: 'letter', count: 1, text: 'Letter card. When the third letter is drawn, the game ends.', printed: '' },
    letter_b: { name: 'B', type: 'letter', count: 1, text: 'Letter card. When the third letter is drawn, the game ends.', printed: '' },

    // Events
    traveling_merchant: { name: 'Traveling Merchant', type: 'event', count: 1, text: 'All players pass their hands to the right, keeping one card.', flavor: 'Fresh supplies are always welcome.' },
    gargok_plague: { name: 'Gargok Plague', type: 'event', count: 1, text: 'All players shuffle their hands back into the deck, unless they immediately play an Age-Old Cure.', flavor: 'Appearing suddenly and mysteriously, it is the great unseen foe of the Gubs.' },
    flash_flood: { name: 'Flash Flood', type: 'event', count: 1, text: 'Shuffle all Free Gubs in play back into the deck.', flavor: 'Gubs can only run so fast, and they can\'t swim at all.' },
    rumor_of_wasps: { name: 'Rumor of Wasps', type: 'event', count: 1, text: 'Shuffle Toad Riders and the Gubs beneath them back into the deck.', flavor: 'Whenever Wasps threaten the Gub colonies, the brave Toad Riders unite to do battle against them.' },

    // Gubs
    gub: { name: 'Gub', type: 'gub', count: 14, text: 'Play onto your side as a Free Gub. Free and Protected Gubs score 1 point each.', printed: '' },
    esteemed_elder: { name: 'Esteemed Elder', type: 'gub', count: 1, text: 'Immune to everything except Lightning. Wins ties.', flavor: 'The Gubs permit only the very wise to lead their society.', printed: 'Immune to everything except Lightning.' },

    // Barricades
    mushroom: { name: 'Mushroom', type: 'barricade', count: 7, text: 'Protect a Gub or force any Mushroom in play to be discarded.', flavor: 'By carving out their centers, the Gubs created perfect dwellings from ground sprouting Mushrooms.' },
    toad_rider: { name: 'Toad Rider', type: 'barricade', count: 4, text: 'Protect a Gub or force any Barricade in play to be discarded.', flavor: 'They are the fabled knights of the Gubs, none more valiant or brave.' },
    velvet_moth: { name: 'Velvet Moth', type: 'barricade', count: 2, text: 'Protect a Gub.', flavor: 'Domesticated long ago, these gentle creatures often arrive in the nick of time to save Gubs from Danger.' },

    // Hazards
    lure: { name: 'Lure', type: 'hazard', count: 7, text: "Draw one Free Gub away from an opponent's side and to your own.", flavor: 'Over here, little guy.' },
    super_lure: { name: 'Super Lure', type: 'hazard', count: 2, text: "Lure all of target player's Free and Protected Gubs. Abandoned Barricades return to owner's hand.", flavor: 'No Gub can resist.' },
    cyclone: { name: 'Cyclone', type: 'hazard', count: 1, text: "Target player's Barricades are destroyed. Gubs are not affected.", flavor: 'In the dry seasons, these hungry storms strip the earth bare.' },
    omen_beetle: { name: 'Omen Beetle', type: 'hazard', count: 1, text: 'All Mushrooms in play are discarded, along with Gubs hiding behind them.', flavor: 'Omen Beetles are feared by the Gubs due to their large size and tendency to consume entire mushroom cities.' },
    smahl_thief: { name: 'Smahl Thief', type: 'hazard', count: 1, text: 'Steal any card in play except for the Esteemed Elder, Rings, or Gubs trapped in Rings.', flavor: 'Notoriously skilled in the arts of thievery, Smahls take pride in their ability to steal nearly anything.' },
    lightning: { name: 'Lightning', type: 'hazard', count: 1, text: 'Smite the Esteemed Elder or force an opponent to discard their hand.', flavor: 'Nothing terrifies Gubs more.' },

    // Traps
    sud_spout: { name: 'Sud Spout', type: 'trap', count: 4, text: 'Trap one Free Gub. Place over Gub wherever it is in play.', flavor: 'Many a Gub has fallen prey to the sticky froth of the Sud Spout, helplessly drifting away in the wind.' },
    single_ring: { name: 'Single Ring', type: 'trap', count: 1, ring: 1, text: 'Trap exactly one Free Gub. Place Trapped Gub beneath this Ring on your side.', flavor: 'Once they grab on, they can\'t bring themselves to let go.' },
    double_ring: { name: 'Double Ring', type: 'trap', count: 1, ring: 2, text: 'Trap exactly two Free Gubs. Place Trapped Gubs beneath this Ring on your side.', flavor: 'It seemed like a good idea... at the time.' },
    triple_ring: { name: 'Triple Ring', type: 'trap', count: 1, ring: 3, text: 'Trap exactly three Free Gubs. Place Trapped Gubs beneath this Ring on your side.', flavor: 'What could be more tempting?' },

    // Tools
    spear: { name: 'Spear', type: 'tool_hazard', count: 4, text: 'Destroy a Sud Spout (Tool) or Kill one Free Gub (Hazard).', flavor: 'A deadly weapon and useful tool.', printed: 'Destroy a Sud Spout or Kill one Free Gub.' },
    haki_flute: { name: 'Haki Flute', type: 'tool', count: 2, text: 'Shatter a Ring and win all of the trapped Gubs clinging to it. Gubs go immediately into play on your side.', flavor: 'The melody of the Haki Flute has a deep yet subtle power.' },
    scout: { name: 'Scout', type: 'tool', count: 1, text: "Look at an opponent's hand or rearrange the top three cards on the deck.", flavor: 'Stealthy and observant, Gub Scouts often prove to be pivotal elements in tactical encounters.' },
    retreat: { name: 'Retreat', type: 'tool', count: 1, text: 'Take any or all cards in play on your side back into your hand.', flavor: 'In battle, Gubs are masters of the tactical retreat.' },

    // Interrupts
    feather: { name: 'Feather', type: 'interrupt', count: 2, text: 'Cancel any Hazard or Trap card when it is played.', flavor: 'Gubs believe the feathers of Hark, the Great Eagle, possess the power to invoke peace.' },
    age_old_cure: { name: 'Age-Old Cure', type: 'interrupt', count: 2, text: 'Protect your hand from the Gargok Plague or take a Gub from the discard pile into your hand.', flavor: 'Their ills they cured with potions.' },
    blindfold: { name: 'Blindfold', type: 'interrupt', count: 1, text: 'Cancel any Lure or Super Lure when it is played.', flavor: 'What you can\'t see can\'t hurt you.' },
    flop_boat: { name: 'Flop Boat', type: 'interrupt', count: 1, text: 'Before an Event takes effect, play this card to have that Event shuffled back into the deck.', flavor: 'Serving in times of need as either shelter or life raft, flop boats often grant Gubs in distress a much needed second chance.' },

    // Wild
    cricket_song: { name: 'Cricket Song', type: 'wild', count: 1, text: 'May be played as any one Hazard, Tool, or Interrupt card.', flavor: 'Crickets sing to the sickle moon, and Gubs fall prey to dreams and shadows.' },
  };

  const TYPE_LABEL = {
    letter: 'Letter', event: 'Event', gub: 'Gub', barricade: 'Barricade', hazard: 'Hazard',
    trap: 'Trap', tool: 'Tool', tool_hazard: 'Tool or Hazard', interrupt: 'Interrupt', wild: 'Wild',
  };

  // Cards Cricket Song can imitate.
  const WILD_TARGETS = Object.keys(CARDS).filter((k) =>
    ['hazard', 'tool', 'tool_hazard', 'interrupt'].includes(CARDS[k].type));

  const api = { CARDS, TYPE_LABEL, WILD_TARGETS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.GUBS_CARDS = api;
})(typeof window !== 'undefined' ? window : globalThis);
