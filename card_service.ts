// card_service.ts - Optimized Card handling service

import { Card } from "./models.ts";
import { Client } from "postgres";
import { bytesToDataURL } from "./convertIMG.ts";

export class CardService {
  private client: Client;
  private cardCache: Map<number, { data: Uint8Array; metadata: any }> = new Map();
  private cardBackImageCache: string | null = null;
  
  constructor(dbClient: Client) {
    this.client = dbClient;
  }
  
  /**
   * Load all cards from database
   * Uses cache if available
   */
  async loadAllCards(): Promise<Card[]> {
    // If we've already cached all cards, construct and return them from cache
    if (this.cardCache.size >= 54) { // We expect 54 cards (52 standard + joker + back)
      const cards: Card[] = [];
      for (const [id, cachedCard] of this.cardCache.entries()) {
        cards.push({
          idCardType: id,
          Picture: cachedCard.data
        });
      }
      return cards.sort((a, b) => a.idCardType - b.idCardType);
    }
    
    // Otherwise, load from database and cache
    const result = await this.client.queryObject<Card>(
      'SELECT * FROM "Cards" ORDER BY "idCardType"'
    );
    
    // Cache the loaded cards
    for (const card of result.rows) {
      const metadata = this.getCardMetadata(card.idCardType);
      this.cardCache.set(card.idCardType, {
        data: card.Picture,
        metadata: metadata
      });
    }
    
    return result.rows;
  }
  
  /**
   * Get card by ID, using cache if available
   */
  async getCardById(cardId: number): Promise<Card | null> {
    // Check cache first
    if (this.cardCache.has(cardId)) {
      const cachedCard = this.cardCache.get(cardId);
      return {
        idCardType: cardId,
        Picture: cachedCard!.data
      };
    }
    
    // If not in cache, load from database
    const result = await this.client.queryObject<Card>(
      'SELECT * FROM "Cards" WHERE "idCardType" = $1',
      [cardId]
    );
    
    if (result.rows.length === 0) {
      return null;
    }
    
    const card = result.rows[0];
    
    // Cache the card
    const metadata = this.getCardMetadata(card.idCardType);
    this.cardCache.set(card.idCardType, {
      data: card.Picture,
      metadata: metadata
    });
    
    return card;
  }
  
  /**
   * Get card metadata based on card type ID
   */
  getCardMetadata(cardTypeId: number): { suit: string; rank: string; value: number } {
    // Check cache first
    if (this.cardCache.has(cardTypeId)) {
      const cachedMetadata = this.cardCache.get(cardTypeId)?.metadata;
      if (cachedMetadata) {
        return cachedMetadata;
      }
    }
    
    // Card IDs 1-52 are standard playing cards
    if (cardTypeId < 1 || cardTypeId > 54) {
      return { suit: 'unknown', rank: 'unknown', value: 0 };
    }
    
    // Card ID 53 is joker, 54 is card back
    if (cardTypeId === 53) {
      return { suit: 'special', rank: 'joker', value: 0 };
    }
    
    if (cardTypeId === 54) {
      return { suit: 'special', rank: 'back', value: 0 };
    }
    
    // For standard cards (1-52)
    // Suit: 1-13 = hearts, 14-26 = diamonds, 27-39 = clubs, 40-52 = spades
    // Rank: Each suit starts with 2 and ends with Ace
    
    let suitIndex = Math.floor((cardTypeId - 1) / 13);
    let rankIndex = (cardTypeId - 1) % 13;
    
    const suits = ['hearts', 'diamonds', 'clubs', 'spades'];
    const ranks = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'jack', 'queen', 'king', 'ace'];
    const values = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]; // Values for comparison (Ace high)
    
    return {
      suit: suits[suitIndex],
      rank: ranks[rankIndex],
      value: values[rankIndex]
    };
  }
  
  /**
   * Get all cards with metadata
   * Takes advantage of cache for better performance
   */
  async getAllCardsWithMetadata(): Promise<any[]> {
    // If we have all cards in cache, use that
    if (this.cardCache.size >= 54) {
      const cardsWithMetadata = [];
      
      for (const [id, cachedCard] of this.cardCache.entries()) {
        cardsWithMetadata.push({
          id,
          ...cachedCard.metadata,
          picture: bytesToDataURL(cachedCard.data, 'image/png')
        });
      }
      
      return cardsWithMetadata.sort((a, b) => a.id - b.id);
    }
    
    // Otherwise load all cards and build the result
    const cards = await this.loadAllCards();
    
    return cards.map(card => {
      const metadata = this.getCardMetadata(card.idCardType);
      const imageData = bytesToDataURL(card.Picture, 'image/png');
      
      return {
        id: card.idCardType,
        suit: metadata.suit,
        rank: metadata.rank,
        value: metadata.value,
        picture: imageData
      };
    });
  }
  
  /**
   * Get card back image (with caching)
   */
  async getCardBackImage(): Promise<string> {
    // Return from cache if available
    if (this.cardBackImageCache) {
      return this.cardBackImageCache;
    }
    
    // Check if card back is in the card cache
    if (this.cardCache.has(54)) {
      const cachedCard = this.cardCache.get(54);
      this.cardBackImageCache = bytesToDataURL(cachedCard!.data, 'image/png');
      return this.cardBackImageCache;
    }
    
    // Otherwise, load from database
    const result = await this.client.queryObject<Card>(
      'SELECT "Picture" FROM "Cards" WHERE "idCardType" = 54'
    );
    
    if (result.rows.length > 0) {
      // Cache the result
      this.cardBackImageCache = bytesToDataURL(result.rows[0].Picture, 'image/png');
      
      // Also store in the card cache
      if (!this.cardCache.has(54)) {
        this.cardCache.set(54, {
          data: result.rows[0].Picture,
          metadata: this.getCardMetadata(54)
        });
      }
      
      return this.cardBackImageCache;
    }
    
    return '';
  }
  
  /**
   * Clear the cache when needed (e.g., after database updates)
   */
  clearCache(): void {
    this.cardCache.clear();
    this.cardBackImageCache = null;
  }
}