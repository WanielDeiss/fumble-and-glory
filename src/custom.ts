import type { Card } from "./data";

// Cards the player created in the installed app. They live only on this device.
const KEY = "fumble-and-glory.custom-cards.v1";

export function loadCustomCards(): Card[] {
  try {
    const cards = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(cards) ? cards.map((c: Card) => ({ ...c, custom: true })) : [];
  } catch {
    return [];
  }
}

/** Returns false when the device refused to store the cards. */
export function saveCustomCards(cards: Card[]): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify(cards));
  } catch {
    return false;
  }
  // Ask the browser not to clear our storage when space runs low.
  void navigator.storage?.persist?.().catch(() => false);
  return true;
}

export const newCustomId = () => `custom-${Date.now().toString(36)}`;
