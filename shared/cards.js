// Card definitions shared by the server and the browser client.
(function (root) {
  const CARDS = {
    // Letters (count as Events)
    letter_g: { name: 'G', type: 'letter', count: 1, text: 'Letter card. When the third letter is drawn, the game ends.' },
    letter_u: { name: 'U', type: 'letter', count: 1, text: 'Letter card. When the third letter is drawn, the game ends.' },
    letter_b: { name: 'B', type: 'letter', count: 1, text: 'Letter card. When the third letter is drawn, the game ends.' },

    // Events
    traveling_merchant: { name: 'Traveling Merchant', type: 'event', count: 1, text: 'All players pass their hands to the right, keeping one card.' },
    gargok_plague: { name: 'Gargok Plague', type: 'event', count: 1, text: 'All players shuffle their hands back into the deck, unless they immediately play an Age-Old Cure.' },
    flash_flood: { name: 'Flash Flood', type: 'event', count: 1, text: 'Shuffle all Free Gubs in play back into the deck.' },
    rumor_of_wasps: { name: 'Rumor of Wasps', type: 'event', count: 1, text: 'Shuffle Toad Riders and the Gubs beneath them back into the deck.' },

    // Gubs
    gub: { name: 'Gub', type: 'gub', count: 14, text: 'Play onto your side as a Free Gub. Free and Protected Gubs score 1 point each.' },
    esteemed_elder: { name: 'Esteemed Elder', type: 'gub', count: 1, text: 'Immune to everything except Lightning. Wins ties.' },

    // Barricades
    mushroom: { name: 'Mushroom', type: 'barricade', count: 7, text: 'Protect a Gub or force any Mushroom in play to be discarded.' },
    toad_rider: { name: 'Toad Rider', type: 'barricade', count: 4, text: 'Protect a Gub or force any Barricade in play to be discarded.' },
    velvet_moth: { name: 'Velvet Moth', type: 'barricade', count: 2, text: 'Protect a Gub.' },

    // Hazards
    lure: { name: 'Lure', type: 'hazard', count: 7, text: "Draw one Free Gub away from an opponent's side and to your own." },
    super_lure: { name: 'Super Lure', type: 'hazard', count: 2, text: "Lure all of target player's Free and Protected Gubs. Abandoned Barricades return to owner's hand." },
    cyclone: { name: 'Cyclone', type: 'hazard', count: 1, text: "Target player's Barricades are destroyed. Gubs are not affected." },
    omen_beetle: { name: 'Omen Beetle', type: 'hazard', count: 1, text: 'All Mushrooms in play are discarded, along with Gubs hiding behind them.' },
    smahl_thief: { name: 'Smahl Thief', type: 'hazard', count: 1, text: 'Steal any card in play except for the Esteemed Elder, Rings, or Gubs trapped in Rings.' },
    lightning: { name: 'Lightning', type: 'hazard', count: 1, text: 'Smite the Esteemed Elder or force an opponent to discard their hand.' },

    // Traps
    sud_spout: { name: 'Sud Spout', type: 'trap', count: 4, text: 'Trap one Free Gub. Place over Gub wherever it is in play.' },
    single_ring: { name: 'Single Ring', type: 'trap', count: 1, ring: 1, text: 'Trap exactly one Free Gub. Place Trapped Gub beneath this Ring on your side.' },
    double_ring: { name: 'Double Ring', type: 'trap', count: 1, ring: 2, text: 'Trap exactly two Free Gubs. Place Trapped Gubs beneath this Ring on your side.' },
    triple_ring: { name: 'Triple Ring', type: 'trap', count: 1, ring: 3, text: 'Trap exactly three Free Gubs. Place Trapped Gubs beneath this Ring on your side.' },

    // Tools
    spear: { name: 'Spear', type: 'tool_hazard', count: 4, text: 'Destroy a Sud Spout (Tool) or Kill one Free Gub (Hazard).' },
    haki_flute: { name: 'Haki Flute', type: 'tool', count: 2, text: 'Shatter a Ring and win all of the trapped Gubs clinging to it. Gubs go immediately into play on your side.' },
    scout: { name: 'Scout', type: 'tool', count: 1, text: "Look at an opponent's hand or rearrange the top three cards on the deck." },
    retreat: { name: 'Retreat', type: 'tool', count: 1, text: 'Take any or all cards in play on your side back into your hand.' },

    // Interrupts
    feather: { name: 'Feather', type: 'interrupt', count: 2, text: 'Cancel any Hazard or Trap card when it is played.' },
    age_old_cure: { name: 'Age-Old Cure', type: 'interrupt', count: 2, text: 'Protect your hand from the Gargok Plague or take a Gub from the discard pile into your hand.' },
    blindfold: { name: 'Blindfold', type: 'interrupt', count: 1, text: 'Cancel any Lure or Super Lure when it is played.' },
    flop_boat: { name: 'Flop Boat', type: 'interrupt', count: 1, text: 'Before an Event takes effect, play this card to have that Event shuffled back into the deck.' },

    // Wild
    cricket_song: { name: 'Cricket Song', type: 'wild', count: 1, text: 'May be played as any one Hazard, Tool, or Interrupt card.' },
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
