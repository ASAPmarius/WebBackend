// models.ts - Types and interfaces for the backend

// User model
export interface User {
  idUser: number;
  Username: string;
  Password: string;
  Profile_picture: Uint8Array | null;
  isAdmin: boolean;
  Bio?: string;
  Favorite_song?: string;
}

// Game model
export interface Game {
  idGame: number;
  DateCreated: Date;
  GameType: string;
  GameStatus: string;
  GameState?: GameState;
}

// Card model
export interface Card {
  idCardType: number;
  Picture: Uint8Array;
}

// Chat message model
export interface ChatMessage {
  idMessages: number;
  idGame: number;
  idUser: number;
  TextContent: string;
  Timestamp: Date;
}

export interface GameState {
  gameType: string; // Add game type for discrimination
  phase: 'waiting' | 'setup' | 'playing' | 'finished';
  currentTurn: number | null;
  round: number;
  startTime?: Date;
  lastActionTime?: Date;
  
  // Common properties for all card games
  playerHands: Record<number, CardMetadata[]>;
  playedCards: Record<number, CardMetadata | null>;
  lastWinner: number | null;
  
  // Game-specific extensions (using type discrimination)
  warState?: WarGameExtension;
  // Future game types can add their own extensions
  // pokerState?: PokerGameExtension;
}

// War-specific extension
export interface WarGameExtension {
  warPile: CardMetadata[];
  inWar: boolean;
  warRound: number;
}

// Player state in game
export interface PlayerState {
  id: number;
  username: string;
  connected: boolean;
  cardCount?: number;
}

// WebSocket message types
export type WebSocketMessage =
  | { type: 'join_game'; gameId: number; auth_token: string; }
  | { type: 'player_action'; action: PlayerAction; gameId: number; auth_token: string; }
  | { type: 'chat_message'; message: string; gameId: number; auth_token: string; }
  | { type: 'sync_request'; gameId: number; auth_token: string; }
  | { type: 'connected_users'; gameId: number; auth_token: string; }
  | { type: 'game_state_request'; gameId: number; auth_token: string; }
  | { type: 'card_request'; gameId: number; auth_token: string; }
  | { type: 'hand_request'; gameId: number; auth_token: string; }
  | { type: 'update_game_state'; gameId: number; gameState: GameState; auth_token: string;}
  | { type: 'update_round'; userId: number; auth_token: string; }
  | { type: 'redirect_to_lobby'; gameId: number; auth_token: string; }
  | { type: 'turn_change'; playerId: number; gameId: number; username?: string; auth_token: string; };

// Player action types
export interface PlayerAction {
  type: 'draw_card' | 'play_card' | 'discard_card' | 'play_war_cards';
  cardId?: number;
  cardType?: number;
  count?: number;
}

// Card metadata
export interface CardMetadata {
  id: number;
  suit: string;
  rank: string;
  value: number;
}

// Connection information
export interface Connection {
  ws: WebSocket;
  username: string;
  gameId: number | null;
  userId: number;
}