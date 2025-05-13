// deno-lint-ignore-file no-explicit-any require-await
import { loadSync } from 'dotenv';
console.log('About to load .env file');
const env = loadSync();
console.log('Loaded .env file:');

for (const [key, value] of Object.entries(env)) {
  Deno.env.set(key, value); //this line is crucial
}

import { Application, Context, Router } from 'oak';
import { cors, type CorsOptions } from 'cors';
import { create, verify } from 'djwt';
import { Client } from 'postgres';
import { base64ToBytes, bytesToDataURL, convertImageToBytes } from './convertIMG.ts';
import { CardService } from "./card_service.ts";
import { GameState, User, Connection, WebSocketMessage, ChatMessage, Card, Game , CardMetadata} from "./models.ts";
import * as config from './config.ts';

// Global error handler
addEventListener("error", (event) => {
  console.error("Global error caught:", event.error);
});

// Unhandled rejection handler
addEventListener("unhandledrejection", (event) => {
  console.error("Unhandled promise rejection:", event.reason);
});

function getEnv(key: string): string {
  const val = Deno.env.get(key);
  if (!val) throw new Error(`Missing env var: ${key}`);
  return val;
}

// Initialize router and application
const router = new Router();
const app = new Application();

const client = new Client(getDatabaseConfig());

try {
  await client.connect();
  console.log('Connected to PostgreSQL database');
} catch (error) {
  console.error('Failed to connect to database:', error);
}

// Initialize card service
const cardService = new CardService(client);


let defaultProfilePictureCache: Uint8Array | null = null;

function getDatabaseConfig() {
  const databaseUrl = Deno.env.get('DATABASE_URL');
  
  if (databaseUrl) {
    try {
      // Parse DATABASE_URL for Heroku
      const regex = /postgres:\/\/([^:]+):([^@]+)@([^:]+):(\d+)\/(.+)/;
      const match = databaseUrl.match(regex);
      
      if (match) {
        const [, user, password, host, port, database] = match;
        console.log("Using Heroku Postgres configuration");
        return {
          user,
          password,
          database,
          hostname: host,
          port: Number(port),
          ssl: { rejectUnauthorized: false }, // Required for Heroku Postgres
        };
      } else {
        console.error("DATABASE_URL format not recognized");
      }
    } catch (error) {
      console.error("Error parsing DATABASE_URL:", error);
    }
  }
  
  // Fallback to individual config vars
  console.log("Using standard database configuration");
  return {
    user: getEnv('DB_USER'),
    password: getEnv('DB_PASSWORD'),
    database: getEnv('DB_NAME'),
    hostname: getEnv('DB_HOST'),
    port: Number(getEnv('DB_PORT')),
  };
}

async function initDefaultProfilePicture(): Promise<void> {
  try {
    console.log('Loading default profile picture...');
    // Embedded default profile picture - this format is correct!
    const base64Default = "data:image/jpeg;base64,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X35acHs8H3r1Xu/u+ghRkzaMnAdWVH/VaEdHfoehDV2oEdusRQkq7r6egtna6BSg60SBI087/wAH17Rt0AAIDrvv41AvU0+rgVjfSry8v/AEYAneibuW6kIQ+nQhGr45bGVBAANj/gwEATvV/S/itvN6Ns/oS7atnd6X+78UAgAdv+Iz1V/PRWYKPxqptnyc6/Gisw/LX8cFZav+PzIeSs09KltB606fHRDXWgNF61knrVkQ8H/v9f/aAAwDAQACAAMAAAAQ8888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888884P/wDPPPPPPPPPPPPPPPOZkPPPPPPPPPPPPPPPPPPPPPPPK/PLZfPPPPPPPPPPPPPIP/PV/PPPPPPPPPPPPPPPPPPPPPEfPfPCNPPPPPPPPPPOLfPPfHvPPPPPPPPPPPPPPPPPPPPPP/ZocPHNPPPPPPPPPNvOdE1O/PPPPPPPPPPPPPPPPPPPPPHekAgmbpvOc9+89fInvZIEEK/PPPPPPPPPPPPPPPPPPPPPFe4ggqtPQp/1KV3SPfAKAgoefPPPPPPPPPPPPPPPPPPPPPHOgggkFfPl/wB21f8AG895CCABq+8888888888888888888882qKCFw88tQ/4434188JCACpt8888888888888888888888e8KXWc888u58oZyc888/IHV58888888888888888888888R8eG88888st889e88888twd48888888888888888888888p8888888888888888888888e8888888888888888888888u28888x/88888888398888828888888888888888888888/e8881jE38888886DRz888uf8888888888888888888888q8889KAA/888888rAAE988888888888888888888888ww8I8888CADf8APPPPPPggFfPPrUaRdPPPPPPPPPPPPPPPPDHHEoevfHqTvPPfN/PLPWX/ADwk33zzzzzzzzzzzzzzzzzzzzzze/8A8888889jAAV98888888/v4w8888888888888888845t3P0888/188WCHF8893888PcjsBI8888888888888888Ms8dx3989dCzwC3j6w/S6989daV888888888888888888888s8X9988/oGAROvsIKsf888utVZ0888888888888888888dk8Y888888sll6/7Mc888888k8sM888888888888888888888s+8888888PBGh+888888p+8888888888888888888888888vW8888888998888888pv888888888888888888888888888uV08888888888884we888888888888888888888888888888e0x8888888856e8888888888888888888888888888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"   
    defaultProfilePictureCache = base64ToBytes(base64Default);
    console.log('Default profile picture loaded successfully!');
  } catch (error) {
    console.error('Failed to load default profile picture:', error);
    defaultProfilePictureCache = null;
  }
}

async function getDefaultProfilePicture(): Promise<Uint8Array> {
  // If we already have the default picture in cache, return it
  if (defaultProfilePictureCache) {
    return defaultProfilePictureCache;
  }
  
  // Otherwise, try to load it from the file
  try {
    defaultProfilePictureCache = await convertImageToBytes('./defaultPP.jpg');
    return defaultProfilePictureCache;
  } catch (error) {
    console.error('Error loading default profile picture:', error);
    // Return an empty Uint8Array as fallback
    return new Uint8Array();
  }
}

await initDefaultProfilePicture();

addEventListener('unload', async () => {
  console.log('🛑 Shutting down — disconnecting Postgres');
  await client.end();
});

let secretKey: CryptoKey;

try {
  // Get the JWT secret from environment
  const jwtSecret = getEnv('SECRET_KEY');
  
  // Convert the string to a Uint8Array
  const encoder = new TextEncoder();
  const secretKeyData = encoder.encode(jwtSecret);
  
  // Import the key
  secretKey = await crypto.subtle.importKey(
    'raw',
    secretKeyData,
    { name: 'HMAC', hash: 'SHA-512' },
    false, // extractable
    ['sign', 'verify']
  );
  
  console.log('JWT secret key imported successfully');
} catch (error) {
  console.error('Failed to import JWT secret key:', error);
  throw new Error('Server configuration error: JWT_SECRET missing or invalid');
}

// Helper function for safely converting binary data to base64
function safelyConvertToBase64(binaryData: Uint8Array | null | undefined): string {
  if (!binaryData) {
    console.warn("Missing binary data for base64 conversion");
    return "";
  }
  
  try {
    // Use a safer approach to convert Uint8Array to base64
    return btoa(
      Array.from(new Uint8Array(binaryData))
        .map(b => String.fromCharCode(b))
        .join('')
    );
  } catch (error) {
    console.error("Error converting binary data to base64:", error);
    return "";
  }
}

await initDefaultProfilePicture();

// Function to check the tokens received by websocket messages
const is_authorized = async (auth_token: string) => {
  if (!auth_token) {
    return false;
  }
  if (auth_token in tokens) {
    try {
      const payload = await verify(auth_token, secretKey);
      if (payload.userName === tokens[auth_token]) {
        return true;
      }
    } catch {
      console.log('verify token failed');
      return false;
    }
  }
  console.log('Unknown token');
  return false;
};

// Update the authorizationMiddleware to better handle tokens and debugging
const authorizationMiddleware = async (ctx: Context, next: () => Promise<unknown>) => {
  const cookie = ctx.request.headers.get('cookie');
  const authToken = cookie?.split('; ').find((row) => row.startsWith('auth_token='))?.split('=')[1];

  // Also check Authorization header as fallback (for clients not using cookies)
  const headerToken = ctx.request.headers.get('Authorization')?.replace('Bearer ', '');
  
  const tokenToUse = authToken || headerToken;

  if (!tokenToUse) {
    console.log('No token found in request');
    ctx.response.status = 401;
    ctx.response.body = { error: 'Unauthorized: Missing token' };
    return;
  }

  try {
    // Verify the token
    const tokenData = await verify(tokenToUse, secretKey);
    
    // Log token data for debugging (remove in production)
    console.log('Token verified successfully:', {
      userName: tokenData.userName,
      userId: tokenData.userId
    });
    
    // Ensure userId exists in token
    if (!tokenData.userId) {
      console.error('Token missing userId property');
      ctx.response.status = 401;
      ctx.response.body = { error: 'Unauthorized: Invalid token format' };
      return;
    }
    
    ctx.state.tokenData = tokenData;
    await next();
  } catch (error) {
    console.error('Token verification failed:', error);
    ctx.response.status = 401;
    ctx.response.body = { error: 'Unauthorized: Invalid token' };
  }
};

// Middleware to check if the user is already connected
const checkIfAlreadyConnected = async (ctx: Context, next: () => Promise<unknown>) => {
  const body = await ctx.request.body.json();
  const { username } = body;

  const isConnected = connections.some((conn) => conn.username === username);

  if (isConnected) {
    ctx.response.status = 403;
    ctx.response.body = { error: 'User is already connected' };
    return;
  }

  await next();
};

async function get_hash(password: string): Promise<string> {
  // Convert password to bytes
  const encoder = new TextEncoder();
  const passwordBytes = encoder.encode(password);
  
  // Generate random salt (16 bytes)
  const salt = crypto.getRandomValues(new Uint8Array(16));
  
  // Hash the password using PBKDF2
  const key = await crypto.subtle.importKey(
    "raw", 
    passwordBytes,
    { name: "PBKDF2" },
    false, 
    ["deriveBits"]
  );
  
  const hash = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt,
      iterations: 210000, // High iteration count for security
      hash: "SHA-256"
    },
    key,
    256 // Output 256 bits (32 bytes)
  );
  
  // Convert to Base64 for storage
  const hashArray = Array.from(new Uint8Array(hash));
  const saltArray = Array.from(salt);
  const hashBase64 = btoa(String.fromCharCode(...hashArray));
  const saltBase64 = btoa(String.fromCharCode(...saltArray));
  
  // Format as salt:hash
  return `${saltBase64}:${hashBase64}`;
}

async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  // Split stored hash into salt and hash
  const [saltBase64, hashBase64] = storedHash.split(':');
  
  if (!saltBase64 || !hashBase64) {
    console.error("Invalid stored hash format");
    return false;
  }
  
  try {
    // Convert salt from Base64
    const saltString = atob(saltBase64);
    const salt = new Uint8Array(saltString.length);
    for (let i = 0; i < saltString.length; i++) {
      salt[i] = saltString.charCodeAt(i);
    }
    
    // Convert password to bytes
    const encoder = new TextEncoder();
    const passwordBytes = encoder.encode(password);
    
    // Import password for PBKDF2
    const key = await crypto.subtle.importKey(
      "raw", 
      passwordBytes,
      { name: "PBKDF2" },
      false, 
      ["deriveBits"]
    );
    
    // Hash with same parameters
    const newHash = await crypto.subtle.deriveBits(
      {
        name: "PBKDF2",
        salt,
        iterations: 210000,
        hash: "SHA-256"
      },
      key,
      256
    );
    
    // Convert to Base64 for comparison
    const newHashArray = Array.from(new Uint8Array(newHash));
    const newHashBase64 = btoa(String.fromCharCode(...newHashArray));
    
    // Compare hashes
    return newHashBase64 === hashBase64;
  } catch (error) {
    console.error("Error verifying password:", error);
    return false;
  }
}

async function getUserById(userId: number): Promise<User | null> {
  const result = await client.queryObject<User>(
    'SELECT * FROM "User" WHERE "idUser" = $1',
    [userId]
  );
  return result.rows.length > 0 ? result.rows[0] : null;
}

// Connection tracking
const connections: Connection[] = [];
const tokens: { [key: string]: string } = {};

function removeTokenByUser(user: string) {
  for (const token in tokens) {
    if (tokens[token] === user) {
      delete tokens[token];
      break;
    }
  }
}

async function getAllActiveGames(): Promise<Game[]> {
  const result = await client.queryObject<Game>(
    'SELECT g.* FROM "Game" g ' +
    'WHERE g."GameStatus" = \'active\' ' +
    'ORDER BY g."DateCreated" DESC'
  );
  return result.rows;
}

async function getUsersInActiveGame(gameId: number): Promise<User[]> {
  const result = await client.queryObject<User>(
    'SELECT u.* FROM "User" u ' +
    'INNER JOIN "Game_Users" gu ON u."idUser" = gu."idUsers" ' +
    'INNER JOIN "Game" g ON gu."idGame" = g."idGame" ' +
    'WHERE gu."idGame" = $1 AND g."GameStatus" = \'active\'',
    [gameId]
  );
  return result.rows;
}
async function getActiveGameForUser(userId: number): Promise<Game | null> {
  const result = await client.queryObject<Game>(
    'SELECT g.* FROM "Game" g ' +
    'INNER JOIN "Game_Users" gu ON g."idGame" = gu."idGame" ' +
    'WHERE gu."idUsers" = $1 AND g."GameStatus" = \'active\' ' +
    'ORDER BY g."DateCreated" DESC LIMIT 1',
    [userId]
  );
  return result.rows.length > 0 ? result.rows[0] : null;
}

async function getGameById(gameId: number): Promise<number | null> {
  // Check if game exists and is active
  const result = await client.queryObject<{ idGame: number }>(
    'SELECT "idGame" FROM "Game" WHERE "idGame" = $1 AND "GameStatus" = \'active\'',
    [gameId]
  );
  
  if (result.rows.length === 0) {
    return null;
  }
  
  return result.rows[0].idGame;
}

async function joinExistingGame(userId: number, gameId: number): Promise<boolean> {
  try {
    console.log(`Attempting to join user ${userId} to game ${gameId}`);
    
    // Check if the game exists and is active
    const gameCheck = await client.queryObject<{ count: number }>(
      'SELECT COUNT(*) as count FROM "Game" WHERE "idGame" = $1 AND "GameStatus" = \'active\'',
      [gameId]
    );
    
    console.log(`Game exists check: ${gameCheck.rows[0].count > 0}`);
    
    if (gameCheck.rows[0].count === 0) {
      console.log(`Game ${gameId} doesn't exist or isn't active`);
      return false;
    }
    
    // Check if user is already part of this game
    const userGameCheck = await client.queryObject<{ count: number }>(
      'SELECT COUNT(*) as count FROM "Game_Users" WHERE "idUsers" = $1 AND "idGame" = $2',
      [userId, gameId]
    );
    
    console.log(`User already in game check: ${userGameCheck.rows[0].count > 0}`);
    
    if (userGameCheck.rows[0].count > 0) {
      // User is already part of this game, that's fine
      console.log(`User ${userId} is already in game ${gameId}, still returning success`);
      return true; // Return true since user is already in the game - this is NOT an error
    } else {
      // User is not part of this game, add them
      console.log(`Adding user ${userId} to game ${gameId}`);
      try {
        await client.queryObject(
          'INSERT INTO "Game_Users" ("idUsers", "idGame") VALUES ($1, $2)',
          [userId, gameId]
        );
        console.log(`User ${userId} successfully added to game ${gameId}`);
        return true;
      } catch (insertError) {
        console.error(`Failed to add user to game:`, insertError);
        throw insertError; // Re-throw to trigger the catch block
      }
    }
  } catch (error) {
    console.error(`Error joining game ${gameId}:`, error);
    return false;
  }
}

async function markGameAsFinished(gameId: number): Promise<void> {
  try {
    console.log(`Marking game ${gameId} as finished`);
    
    // First check if the game is already finished to avoid unnecessary updates
    const gameCheck = await client.queryObject<{ GameStatus: string }>(
      'SELECT "GameStatus" FROM "Game" WHERE "idGame" = $1',
      [gameId]
    );
    
    if (gameCheck.rows.length === 0) {
      console.log(`Game ${gameId} not found, cannot mark as finished`);
      return;
    }
    
    if (gameCheck.rows[0].GameStatus === 'finished') {
      console.log(`Game ${gameId} is already marked as finished`);
      return;
    }
    
    // Update the game status to 'finished'
    await client.queryObject(
      'UPDATE "Game" SET "GameStatus" = \'finished\' WHERE "idGame" = $1',
      [gameId]
    );
    
    console.log(`Game ${gameId} successfully marked as finished`);
    
    // Once marked as finished, we can clean up the ActiveCards
  } catch (error) {
    console.error(`Error marking game ${gameId} as finished:`, error);
    throw error; // Re-throw so caller can handle if needed
  }
}

async function getUserByUsername(username: string): Promise<User | null> {
  const result = await client.queryObject<User>(
    'SELECT * FROM "User" WHERE "Username" = $1',
    [username]
  );
  return result.rows.length > 0 ? result.rows[0] : null;
}

async function createUser(
  username: string, 
  password: string, 
  profilePicture: Uint8Array | null,
  bio: string | null = null,
  favoriteSong: string | null = null
): Promise<User> {
  const hashedPassword = await get_hash(password);
  if (!profilePicture) {
    profilePicture = await getDefaultProfilePicture();
  }
  
  const result = await client.queryObject<User>(
    'INSERT INTO "User" ("Username", "Password", "Profile_picture", "isAdmin", "Bio", "Favorite_song") ' +
    'VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
    [username, hashedPassword, profilePicture, false, bio, favoriteSong]
  );
  
  return result.rows[0];
}

async function addUserToGame(userId: number, gameId: number): Promise<void> {
  await client.queryObject(
    'INSERT INTO "Game_Users" ("idUsers", "idGame") VALUES ($1, $2) ON CONFLICT DO NOTHING',
    [userId, gameId]
  );
}

async function recordChatMessage(gameId: number, userId: number, textContent: string): Promise<ChatMessage> {
  const result = await client.queryObject<ChatMessage>(
    'INSERT INTO "ChatMessages" ("idGame", "idUser", "TextContent") VALUES ($1, $2, $3) RETURNING *',
    [gameId, userId, textContent]
  );
  return result.rows[0];
}

async function getUsersInGame(gameId: number): Promise<User[]> {
  const result = await client.queryObject<User>(
    'SELECT u.* FROM "User" u INNER JOIN "Game_Users" gu ON u."idUser" = gu."idUsers" WHERE gu."idGame" = $1',
    [gameId]
  );
  return result.rows;
}

// No need to initialize cards as they're already inserted
async function checkCardTypes(): Promise<void> {
  // Check how many cards exist
  const existingCards = await client.queryObject<{ count: number }>('SELECT COUNT(*) as count FROM "Cards"');
  console.log(`Found ${existingCards.rows[0].count} card types in database`);
}

// Call this during server startup
await checkCardTypes();

// Current game tracking
let currentGameId: number | null = null;

async function initializeGameState(gameId: number, gameType: string = "war"): Promise<GameState> {
  // Get the players in the game
  const players = await getUsersInGame(gameId);
  
  // Initialize with common state
  const initialState: GameState = {
    gameType: gameType,
    phase: players.length >= 2 ? 'playing' : 'waiting',
    currentTurn: players.length > 0 ? players[0].idUser : null,
    round: 1,
    startTime: new Date(),
    lastActionTime: new Date(),
    playerHands: {},
    playedCards: {},
    lastWinner: null
  };
  
  // Add game-specific extensions
  if (gameType === "war") {
    initialState.warState = {
      warPile: [],
      inWar: false,
      warRound: 0
    };
  }
  
  console.log(`Initialized game state for ${gameType} game ${gameId}: ${JSON.stringify(initialState)}`);
  return initialState;
}

async function startGame(gameId: number): Promise<void> {
  try {
    // Get current game state or initialize if not exists
    let gameState = await getGameState(gameId);
    if (!gameState) {
      gameState = await initializeGameState(gameId);
    }
    
    // Change phase to playing
    gameState.phase = 'playing';
    
    // Get the players in the game
    const players = await getUsersInGame(gameId);
    
    if (players.length >= 2) {
      // Set the first player's turn (could be randomized)
      gameState.currentTurn = players[0].idUser;
      
      // Update the game state
      await updateGameState(gameId, gameState);
      
      // ADD THIS LINE: Initialize the game with cards for each player
      await initializeGame(gameId);
      
      // Notify all players that the game has started
      notifyGameUsers(gameId, {
        type: 'game_state',
        gameState: gameState
      });
      
      // Also notify specifically about the turn change
      notifyGameUsers(gameId, {
        type: 'turn_change',
        playerId: gameState.currentTurn,
        username: players[0].Username
      });
      
      console.log(`Game ${gameId} successfully started with ${players.length} players`);
    } else {
      throw new Error('Need at least 2 players to start the game');
    }
  } catch (error) {
    console.error(`Error starting game ${gameId}:`, error);
    throw error;
  }
}

async function getGameState(gameId: number): Promise<GameState | null> {
  try {
    // Check for an existing game state in the database
    const result = await client.queryObject<{ game_state: string | Record<string, any> }>(
      'SELECT "GameState" as game_state FROM "Game" WHERE "idGame" = $1',
      [gameId]
    );
    
    if (result.rows.length === 0) {
      // No game state found
      return null;
    }
    
    // Handle case where game_state is already an object (no need to parse)
    if (!result.rows[0].game_state) {
      return null;
    }
    
    // Check if we need to parse the JSON
    if (typeof result.rows[0].game_state === 'string') {
      try {
        // Parse the stored JSON
        return JSON.parse(result.rows[0].game_state) as GameState;
      } catch (parseError) {
        console.error(`Error parsing game state JSON for game ${gameId}:`, parseError);
        
        // If parsing fails, create a new default game state
        console.log(`Creating default game state for game ${gameId} due to parsing error`);
        const newState = await initializeGameState(gameId);
        await updateGameState(gameId, newState);
        return newState;
      }
    } else {
      // It's already an object
      return result.rows[0].game_state as GameState;
    }
  } catch (error) {
    console.error(`Error getting game state for game ${gameId}:`, error);
    return null;
  }
}

async function updateGameState(gameId: number, gameState: GameState): Promise<void> {
  try {
    // Make sure we have a valid object
    if (!gameState || typeof gameState !== 'object') {
      console.error(`Invalid game state for game ${gameId}:`, gameState);
      return;
    }
    
    // Convert the game state to JSON string
    const gameStateJSON = JSON.stringify(gameState);
    
    // Update the game state in the database
    await client.queryObject(
      'UPDATE "Game" SET "GameState" = $1 WHERE "idGame" = $2',
      [gameStateJSON, gameId]
    );
    const gameStateWithoutSensitiveData = {
      ...gameState,
      playerHands: undefined,
      playedCards: Object.fromEntries(
      Object.entries(gameState.playedCards || {}).map(([playerId, card]) => [
        playerId, { ...card, picture: undefined }
      ])
      )
    };

    console.log(`Updated game state for game ${gameId}:`, JSON.stringify(gameStateWithoutSensitiveData, null, 2));
  } catch (error) {
    console.error(`Error updating game state for game ${gameId}:`, error);
    throw error;
  }
}

async function handleJoinGame(data: any, userId: number, ws: WebSocket) {
  const { gameId } = data;
  
  if (!gameId) {
    ws.send(JSON.stringify({
      type: "error",
      message: "Missing game ID"
    }));
    return;
  }
  
  try {
    console.log(`User ${userId} joining game ${gameId}`);
    
    // Add user to game
    await addUserToGame(userId, gameId);
    
    // Find this connection in the connections array
    const connIndex = connections.findIndex(c => c.userId === userId);
    
    if (connIndex !== -1) {
      console.log(`Updating connection for user ${userId}: setting gameId to ${gameId}`);
      connections[connIndex].gameId = Number(gameId);
    } else {
      console.warn(`Connection not found for user ${userId} when joining game ${gameId}`);
    }
    
    // Log connections after update
    console.log(`Current connections after join:`);
    connections.forEach(conn => {
      console.log(`- User: ${conn.username}, ID: ${conn.userId}, Game: ${conn.gameId}`);
    });
    
    // Send success response
    ws.send(JSON.stringify({
      type: "join_game_success",
      gameId
    }));
    
    // Update connected users
    sendConnectedUsers(gameId);
    
    // Send game state
    sendGameState(gameId, ws);
  } catch (error) {
    console.error("Error joining game:", error);
    ws.send(JSON.stringify({
      type: "error",
      message: "Failed to join game"
    }));
  }
}

async function handlePlayerAction(data: any, userId: number, username: string, ws: WebSocket) {
  const { gameId, action } = data;
  
  if (!gameId || !action) {
    ws.send(JSON.stringify({
      type: "error",
      message: "Missing game ID or action"
    }));
    return;
  }
  
  try {
    // Get current game state
    const gameState = await getGameState(gameId);
    
    // Validate action (e.g., check if it's player's turn)
    if (gameState && gameState.phase === "playing" && gameState.currentTurn !== null) {
      if (gameState.currentTurn !== userId) {
        ws.send(JSON.stringify({
          type: "error",
          message: "Not your turn"
        }));
        return;
      }
    }

    if (action.type === 'play_card' && action.cardId) {
      await handlePlayCard(gameId, userId, action.cardId);
    }
    
    // THIS IS THE CRITICAL PART - make sure this is broadcasting to everyone
    notifyGameUsers(gameId, {
      type: "player_action",
      playerId: userId,
      username,
      action
    });
    
    // Update last action time in game state
    if (gameState) {
      gameState.lastActionTime = new Date();
      await updateGameState(gameId, gameState);
    }
  } catch (error) {
    console.error("Error handling player action:", error);
    ws.send(JSON.stringify({
      type: "error",
      message: "Failed to process action"
    }));
  }
}

async function handleChatMessage(data: any, userId: number, username: string) {
  const { gameId, message } = data;
  
  if (!gameId || !message) {
    return;
  }
  
  try {
    // Record chat message in database
    await recordChatMessage(gameId, userId, message);
    
    // Get user profile picture
    const user = await getUserById(userId);
    let profilePicture = "";
    
    if (user && user.Profile_picture) {
      profilePicture = bytesToDataURL(user.Profile_picture, "image/png");
    }
    
    // Broadcast message to all users in game
    notifyGameUsers(gameId, {
      type: "message",
      message,
      owner: username,
      user_pp_path: profilePicture,
      userId
    });
  } catch (error) {
    console.error("Error handling chat message:", error);
  }
}

async function handleGameStateUpdate(data: any, userId: number, ws: WebSocket) {
  const { gameId, gameState } = data;
  
  if (!gameId || !gameState) {
    ws.send(JSON.stringify({
      type: "error",
      message: "Missing game ID or game state data"
    }));
    return;
  }
  
  try {
    // Get current game state from database
    const currentGameState = await getGameState(gameId);
    if (!currentGameState) {
      throw new Error("Game state not found");
    }
    
    // Update only the specified fields
    const updatedGameState = { ...currentGameState };
    
    // Update round if provided
    if (gameState.round !== undefined) {
      updatedGameState.round = gameState.round;
      console.log(`Updating game ${gameId} round to ${gameState.round}`);
    }
    
    // Update other fields as needed
    if (gameState.phase !== undefined) {
      updatedGameState.phase = gameState.phase;
    }
    
    // Save updated game state
    await updateGameState(gameId, updatedGameState);
    
    // Broadcast updated game state to all players
    notifyGameUsers(gameId, {
      type: "game_state",
      gameState: updatedGameState
    });
  } catch (error) {
    console.error("Error updating game state:", error);
    ws.send(JSON.stringify({
      type: "error",
      message: "Failed to update game state"
    }));
  }
}

async function handleRoundUpdate(data: any, userId: number, ws: WebSocket) {
  const { gameId, round } = data;
  
  if (!gameId || !round) {
    ws.send(JSON.stringify({
      type: "error",
      message: "Missing game ID or round number"
    }));
    return;
  }
  
  try {
    console.log(`Updating round for game ${gameId} to ${round}`);
    
    // Get current game state
    const gameState = await getGameState(gameId);
    if (!gameState) {
      throw new Error("Game state not found");
    }
    
    // Update round
    gameState.round = round;
    
    // Save updated game state
    await updateGameState(gameId, gameState);
    
    // Notify all clients about the updated game state
    notifyGameUsers(gameId, {
      type: "game_state",
      gameState
    });
  } catch (error) {
    console.error("Error updating round:", error);
    ws.send(JSON.stringify({
      type: "error",
      message: "Failed to update round"
    }));
  }
}

async function handleTurnChange(data: any, userId: number, username: string, ws: WebSocket) {
  const { gameId, playerId } = data;
  
  if (!gameId || !playerId) {
    ws.send(JSON.stringify({
      type: "error",
      message: "Missing game ID or player ID"
    }));
    return;
  }
  
  try {
    console.log(`Turn change: Game ${gameId}, Player ${playerId} (${username})`);
    
    // Get current game state
    const gameState = await getGameState(gameId);
    if (!gameState) {
      throw new Error("Game state not found");
    }
    
    // Update turn
    gameState.currentTurn = Number(playerId);
    gameState.lastActionTime = new Date();
    
    // Save updated game state
    await updateGameState(gameId, gameState);
    
    // Notify all clients about the turn change
    notifyGameUsers(gameId, {
      type: "turn_change",
      playerId,
      username: data.username || username
    });
  } catch (error) {
    console.error("Error handling turn change:", error);
    ws.send(JSON.stringify({
      type: "error",
      message: "Failed to process turn change"
    }));
  }
}

async function handleRedirectToLobby(data: any, userId: number, username: string) {
  const gameIdToRedirect = data.gameId;
  console.log(`User ${username} requested redirect to lobby for game ${gameIdToRedirect}`);
  
  // Verify the game state is finished before redirecting everyone
  const gameState = await getGameState(gameIdToRedirect);
  notifyGameUsers(gameIdToRedirect, {
    type: "redirect_to_lobby"
  });
  console.log(`Broadcasting lobby redirect to all players in game ${gameIdToRedirect}`);
}

async function loadAllCardsWithMetadata(): Promise<CardMetadata[]> {
  try {
    // Load all cards from database
    const cards = await client.queryObject<Card>(
      'SELECT * FROM "Cards" ORDER BY "idCardType"'
    );
    
    if (!cards.rows.length) {
      console.error('No cards found in database');
      return [];
    }
    
    // Convert DB cards to cards with metadata
    const cardsWithMetadata: CardMetadata[] = cards.rows.map(card => {
      // Extract metadata based on card ID
      const metadata = getCardMetadata(card.idCardType);
      
      // Convert binary image to data URL
      const imageData = bytesToDataURL(card.Picture, 'image/png');
      
      // Create the card metadata object
      return {
        id: card.idCardType,
        suit: metadata.suit,
        rank: metadata.rank,
        value: metadata.value,
        picture: imageData
      };
    });
    
    console.log(`Loaded ${cardsWithMetadata.length} cards with metadata`);
    return cardsWithMetadata;
  } catch (error) {
    console.error('Error loading cards with metadata:', error);
    return [];
  }
}

// Helper function to get card metadata
function getCardMetadata(cardTypeId: number): { suit: string; rank: string; value: number } {
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
  
  const suitIndex = Math.floor((cardTypeId - 1) / 13);
  const rankIndex = (cardTypeId - 1) % 13;
  
  const suits = ['hearts', 'diamonds', 'clubs', 'spades'];
  const ranks = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'jack', 'queen', 'king', 'ace'];
  const values = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]; // Values for comparison (Ace high)
  
  return {
    suit: suits[suitIndex],
    rank: ranks[rankIndex],
    value: values[rankIndex]
  };
}

async function advanceTurn(gameId: number): Promise<void> {
  try {
    // Get current game state
    const gameState = await getGameState(gameId);
    if (!gameState) {
      console.error(`Game state not found for game ${gameId}`);
      return;
    }
    
    // Get all players in the game
    const players = await getUsersInGame(gameId);
    if (players.length < 2) {
      console.error(`Not enough players in game ${gameId} to advance turn`);
      return;
    }
    
    // Find current player index - ensure number comparison
    const currentTurn = Number(gameState.currentTurn);
    const currentPlayerIndex = players.findIndex(p => Number(p.idUser) === currentTurn);
    
    if (currentPlayerIndex === -1) {
      console.error(`Current turn player ${currentTurn} not found in players list`);
      return;
    }
    
    // Calculate next player index
    const nextPlayerIndex = (currentPlayerIndex + 1) % players.length;
    const nextPlayerId = Number(players[nextPlayerIndex].idUser);
    
    console.log(`Advancing turn from player ${currentTurn} to player ${nextPlayerId}`);
    
    // Update game state - store as number
    gameState.currentTurn = nextPlayerId;
    gameState.lastActionTime = new Date();
    await updateGameState(gameId, gameState);
    
    // Notify all clients about the turn change
    notifyGameUsers(gameId, {
      type: "turn_change",
      playerId: nextPlayerId,
      gameId: gameId,
      username: players[nextPlayerIndex].Username
    });
    
    console.log(`Turn advanced for game ${gameId}`);
  } catch (error) {
    console.error(`Error advancing turn for game ${gameId}:`, error);
  }
}

async function handlePlayCard(gameId: number, playerId: number, cardId: number): Promise<boolean> {
  // Get current game state
  const gameState = await getGameState(gameId);
  if (!gameState) return false;
  
  // Ensure we're tracking player hands
  if (!gameState.playerHands) {
    gameState.playerHands = {};
  }
  
  // Ensure we're tracking played cards
  if (!gameState.playedCards) {
    gameState.playedCards = {};
  }
  
  // Validate it's the player's turn
  if (gameState.currentTurn !== playerId) {
    return false;
  }
  
  // Check if player already played a card
  if (gameState.playedCards[playerId]) {
    return false;
  }
  
  // Get player's hand
  const hand = gameState.playerHands[playerId] || [];
  
  // Find the card
  const cardIndex = hand.findIndex(card => card.id === cardId);
  if (cardIndex === -1) return false;
  
  // Get the card
  const card = hand[cardIndex];
  
  // Remove from hand
  hand.splice(cardIndex, 1);
  
  // Add to played cards - only store necessary data, not picture
  gameState.playedCards[playerId] = {
    id: card.id,
    suit: card.suit,
    rank: card.rank,
    value: card.value
  };
  
  // Update game state
  await updateGameState(gameId, gameState);

  const user = await getUserById(playerId);
  const username = user ? user.Username : "Unknown";
  
  // Notify all clients
  notifyGameUsers(gameId, {
    type: "player_action",
    playerId,
    username,
    action: {
      type: "play_card",
      cardId
    }
  });
  
  // Check if round should be resolved
  if (Object.keys(gameState.playedCards).length === 2) {
    resolveRound(gameId);
  } else {
    // Advance to next player's turn
    advanceTurn(gameId);
  }
  
  return true;
}

async function handleWarCardPlay(gameId: number, playerId: number, cardId: number): Promise<void> {
  // Similar to handlePlayCard but with war-specific logic
  const gameState = await getGameState(gameId);
  if (!gameState) return;
  
  // Check if player has already played
  if (gameState.playedCards[playerId]) {
    console.log(`Player ${playerId} already played a card in this war round`);
    return;
  }
  
  // Get player's hand
  const hand = gameState.playerHands[playerId] || [];
  
  // Find the card
  const cardIndex = hand.findIndex(card => card.id === cardId);
  if (cardIndex === -1) {
    console.warn(`Card ${cardId} not found in player ${playerId}'s hand`);
    return;
  }
  
  // Get the card
  const card = hand[cardIndex];
  
  // Remove from hand
  hand.splice(cardIndex, 1);
  
  // Add to played cards
  gameState.playedCards[playerId] = {
    id: card.id,
    suit: card.suit,
    rank: card.rank,
    value: card.value
  };
  
  // Update game state
  await updateGameState(gameId, gameState);
  
  // Notify about the card play
  const users = await getUsersInGame(gameId);
  const player = users.find(u => Number(u.idUser) === Number(playerId));
  
  notifyGameUsers(gameId, {
    type: "player_action",
    playerId,
    username: player ? player.Username : "Unknown",
    action: {
      type: "play_card",
      cardId,
      warMode: true
    }
  });
  
  // Check if both players have played their war cards
  if (Object.keys(gameState.playedCards).length === 2) {
    // Resolve the war
    setTimeout(() => resolveRound(gameId), 1000);
  } else {
    // Set the other player's turn
    const playerIds = Object.keys(gameState.playerHands).map(Number);
    const otherPlayerId = playerIds.find(id => id !== playerId);
    
    if (otherPlayerId) {
      gameState.currentTurn = otherPlayerId;
      await updateGameState(gameId, gameState);
      
      const otherPlayer = users.find(u => Number(u.idUser) === Number(otherPlayerId));
      if (otherPlayer) {
        notifyGameUsers(gameId, {
          type: "turn_change",
          playerId: otherPlayerId,
          username: otherPlayer.Username,
          warMode: true
        });
      }
    }
  }
}

async function resolveRound(gameId: number): Promise<void> {
  // Get current game state
  const gameState = await getGameState(gameId);
  if (!gameState) return;
  
  // Check game type and route to appropriate handler
  if (gameState.gameType === "war") {
    await resolveWarRound(gameId, gameState);
  } else {
    // Generic card game round resolution
    // This would be implemented based on game rules
    console.log("Generic card game round resolution not implemented");
  }
}

async function resolveWarRound(gameId: number, gameState: GameState): Promise<void> {
  // Get the played cards
  const playedCards = gameState.playedCards || {};
  if (Object.keys(playedCards).length !== 2) return;

  const playerIds = Object.keys(playedCards).map(Number);
  const player1Id = playerIds[0];
  const player2Id = playerIds[1];

  // Ensure both players have cards in hand
  if (!gameState.playerHands[player1Id] || !gameState.playerHands[player2Id]) {
    console.error(`One or both players don't have hands`);
    return;
  }

  // Add null checks
  const card1 = playedCards[player1Id];
  const card2 = playedCards[player2Id];

  if (!card1 || !card2) {
    console.error('Missing played cards for one or both players');
    return;
  }

  // Make sure warState exists
  if (!gameState.warState) {
    gameState.warState = {
      warPile: [],
      inWar: false,
      warRound: 0
    };
  }
  
  // Add played cards to war pile
  gameState.warState.warPile.push(card1, card2);
  
  // Add a delay before resolving the round
  await new Promise(resolve => setTimeout(resolve, 500));
  
  // Compare cards to determine winner
  let result = 0;
  if (card1.value > card2.value) {
    result = 1; // Player 1 wins
  } else if (card1.value < card2.value) {
    result = 2; // Player 2 wins
  } else {
    result = 0; // War (tie)
  }
  
  // Handle the result
  if (result === 0) {
    // WAR - Players tied!
    console.log(`WAR between players ${player1Id} and ${player2Id}`);
    
    // Check if players have enough cards for war
    if (gameState.playerHands[player1Id].length < 2 || gameState.playerHands[player2Id].length < 2) {
      // Not enough cards for war, determine winner based on who has more cards
      const winnerId = gameState.playerHands[player1Id].length > gameState.playerHands[player2Id].length 
                      ? player1Id : player2Id;
      
      // Award all cards to winner
      handleWarEnd(gameId, gameState, winnerId, "not enough cards for war");
      return;
    }
    
    // Set up for war
    gameState.warState.inWar = true;
    gameState.warState.warRound = (gameState.warState.warRound || 0) + 1;
    
    // Clear played cards to prepare for next round
    gameState.playedCards = {};
    
    // Update game state
    await updateGameState(gameId, gameState);
    
    // Notify clients about war
    notifyGameUsers(gameId, {
      type: "war_start",
      warRound: gameState.warState.warRound,
      warPileSize: gameState.warState.warPile.length
    });
    
    await processWarAutomatically(gameId, player1Id, player2Id);
    
    return;
  }
  
  // Normal round win - no war
  const winnerId = result === 1 ? player1Id : player2Id;
  handleWarEnd(gameId, gameState, winnerId, "normal win");
}

async function processWarAutomatically(gameId: number, player1Id: number, player2Id: number): Promise<void> {
  // Get game state
  const gameState = await getGameState(gameId);
  if (!gameState) return;
  
  // Ensure warState exists
  if (!gameState.warState) {
    gameState.warState = {
      warPile: [],
      inWar: false,
      warRound: 0
    };
  }
  
  const player1Hand = gameState.playerHands[player1Id];
  const player2Hand = gameState.playerHands[player2Id];
  
  // Double-check that both players have enough cards
  if (player1Hand.length < 2 || player2Hand.length < 2) {
    // Not enough cards, end the war with whoever has more cards winning
    const winnerId = player1Hand.length > player2Hand.length ? player1Id : player2Id;
    await handleWarEnd(gameId, gameState, winnerId, "not enough cards for war");
    return;
  }
  
  // Get user information for notifications
  const users = await getUsersInGame(gameId);
  const player1 = users.find(u => Number(u.idUser) === Number(player1Id));
  const player2 = users.find(u => Number(u.idUser) === Number(player2Id));
  
  // STEP 1: Take face down cards from both players
  const player1FaceDown = player1Hand.shift();
  const player2FaceDown = player2Hand.shift();
  
  if (!player1FaceDown || !player2FaceDown) {
    console.error("Missing face down cards in war");
    return;
  }
  
  // Add to war pile
  gameState.warState.warPile.push(player1FaceDown, player2FaceDown);
  
  // Notify clients about face-down cards
  notifyGameUsers(gameId, {
    type: "war_progress",
    message: "Both players placed a card face down",
    player1: player1?.Username || "Player 1",
    player2: player2?.Username || "Player 2",
    warPileSize: gameState.warState.warPile.length
  });
  
  // Update game state
  await updateGameState(gameId, gameState);
  
  // Short delay for UI
  await new Promise(resolve => setTimeout(resolve, 1500));
  
  // STEP 2: Take face up cards from both players and compare
  const player1FaceUp = player1Hand.shift();
  const player2FaceUp = player2Hand.shift();
  
  if (!player1FaceUp || !player2FaceUp) {
    console.error("Missing face up cards in war");
    return;
  }
  
  // Add to war pile
  gameState.warState.warPile.push(player1FaceUp, player2FaceUp);
  
  // Notify clients about the face-up cards
  notifyGameUsers(gameId, {
    type: "player_action",
    playerId: player1Id,
    username: player1?.Username || "Player 1",
    action: {
      type: "play_war_card",
      cardId: player1FaceUp.id
    }
  });
  
  notifyGameUsers(gameId, {
    type: "player_action",
    playerId: player2Id,
    username: player2?.Username || "Player 2",
    action: {
      type: "play_war_card",
      cardId: player2FaceUp.id
    }
  });
  
  // Update game state with the face-up cards
  await updateGameState(gameId, gameState);
  
  // Short delay for UI
  await new Promise(resolve => setTimeout(resolve, 1500));
  
  // Compare face-up cards to determine winner or another war
  if (player1FaceUp.value > player2FaceUp.value) {
    // Player 1 wins
    await handleWarEnd(gameId, gameState, player1Id, "won war with higher card");
  } else if (player1FaceUp.value < player2FaceUp.value) {
    // Player 2 wins
    await handleWarEnd(gameId, gameState, player2Id, "won war with higher card");
  } else {
    // Another tie - recursive war (but check if enough cards first)
    if (player1Hand.length < 2 || player2Hand.length < 2) {
      const winnerId = player1Hand.length > player2Hand.length ? player1Id : player2Id;
      await handleWarEnd(gameId, gameState, winnerId, "won war due to opponent running out of cards");
    } else {
      // Notify about another war
      gameState.warState.warRound += 1;
      await updateGameState(gameId, gameState);
      
      notifyGameUsers(gameId, {
        type: "war_start",
        warRound: gameState.warState.warRound,
        message: "War again! Both players tied"
      });
      
      // Recursive call for another war
      await processWarAutomatically(gameId, player1Id, player2Id);
    }
  }
}

async function handleWarEnd(gameId: number, gameState: GameState, winnerId: number, reason: string): Promise<void> {
  // Get winner's hand
  if (!gameState.playerHands[winnerId]) {
    gameState.playerHands[winnerId] = [];
  }
  
  // Make sure warState exists
  if (!gameState.warState) {
    gameState.warState = {
      warPile: [],
      inWar: false,
      warRound: 0
    };
  }
  
  // Award all cards in war pile to winner
  const cardsWon = [...gameState.warState.warPile];
  gameState.playerHands[winnerId].push(...cardsWon);

  // Log both players' hands without the 'picture' property
  const playerHandsWithoutPictures = Object.entries(gameState.playerHands).map(([playerId, hand]) => ({
    playerId,
    hand: hand.map(({ id, suit, rank, value }) => ({ id, suit, rank, value }))
  }));

  console.log("Player hands without pictures:", playerHandsWithoutPictures);
  
  // Clear war state
  gameState.warState.inWar = false;
  gameState.warState.warRound = 0;
  gameState.warState.warPile = [];
  gameState.playedCards = {};
  
  // Update round
  gameState.round = (gameState.round || 1) + 1;
  gameState.lastWinner = winnerId;
  
  // Update game state
  await updateGameState(gameId, gameState);
  
  // Get winner name
  const users = await getUsersInGame(gameId);
  const winner = users.find(u => Number(u.idUser) === Number(winnerId));
  
  // Notify all clients about the round result
  notifyGameUsers(gameId, {
    type: "round_result",
    winnerId: winnerId,
    winnerName: winner ? winner.Username : "Unknown",
    cardCount: cardsWon.length,
    newRound: gameState.round,
    reason: reason
  });
  
  // Check for game end conditions
  checkGameEndCondition(gameId, gameState);
  
  // Set winner as next player
  gameState.currentTurn = winnerId;
  await updateGameState(gameId, gameState);
  
  // Notify about turn change
  if (winner) {
    notifyGameUsers(gameId, {
      type: "turn_change",
      playerId: winnerId,
      username: winner.Username
    });
  }
}

async function checkGameEndCondition(gameId: number, gameState: GameState): Promise<boolean> {
  if (gameState.gameType === "war") {
    return checkWarGameEndCondition(gameId, gameState);
  } else {
    // Generic game end condition check - placeholder for other game types
    console.log("Generic game end condition check not implemented");
    return false;
  }
}

async function checkWarGameEndCondition(gameId: number, gameState: GameState): Promise<boolean> {
  // Check if any player has no cards left
  for (const [playerId, hand] of Object.entries(gameState.playerHands)) {
    if (hand.length === 0) {
      // Find winner (player with cards)
      const winnerPlayerId = Object.entries(gameState.playerHands)
        .find(([_, playerHand]) => playerHand.length > 0)?.[0];
        
      if (winnerPlayerId) {
        const users = await getUsersInGame(gameId);
        const winnerUser = users.find(u => String(u.idUser) === String(winnerPlayerId));
        
        // Update game status
        gameState.phase = 'finished';
        await updateGameState(gameId, gameState);
        
        console.log(`War game ${gameId} ended - winner is ${winnerUser?.Username} (ID: ${winnerPlayerId})`);
        
        // Notify about game end
        notifyGameUsers(gameId, {
          type: "game_end",
          winnerId: Number(winnerPlayerId),
          winnerName: winnerUser ? winnerUser.Username : "Unknown"
        });
        
        return true;
      }
    }
  }
  
  return false;
}

async function initializeGame(gameId: number): Promise<void> {
  // Get the game
  const game = await getGameById(gameId);
  if (!game) return;
  
  // Get game type from the database
  const gameTypeResult = await client.queryObject<{ GameType: string }>(
    'SELECT "GameType" FROM "Game" WHERE "idGame" = $1',
    [gameId]
  );
  
  if (gameTypeResult.rows.length === 0) return;
  
  const gameType = gameTypeResult.rows[0].GameType;
  
  // Initialize based on game type
  if (gameType === "war") {
    await initializeWarGame(gameId);
  } else {
    // Generic initialization for other game types
    const players = await getUsersInGame(gameId);
    if (players.length < 1) return;
    
    // Create game state if it doesn't exist
    let gameState = await getGameState(gameId);
    if (!gameState) {
      gameState = await initializeGameState(gameId, gameType);
    }
    
    // Set gameType
    gameState.gameType = gameType;
    
    // Update game state
    await updateGameState(gameId, gameState);
    
    // Notify all players
    notifyGameUsers(gameId, {
      type: "game_state",
      gameState
    });
  }
}

// War-specific initialization
async function initializeWarGame(gameId: number): Promise<void> {
  // Get players
  const players = await getUsersInGame(gameId);
  if (players.length < 2) return;
  
  // Create game state if it doesn't exist
  let gameState = await getGameState(gameId);
  if (!gameState) {
    gameState = await initializeGameState(gameId, "war");
  }
  
  // Set game type
  gameState.gameType = "war";
  
  const cards = await loadAllCardsWithMetadata();
  const deck = cards.filter((card: CardMetadata) => card.id >= 1 && card.id <= 52);
  
  // Shuffle the deck
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  
  // Divide cards between players - MODIFIED to remove picture data
  const halfDeck = Math.floor(deck.length / 2);
  
  gameState.playerHands = {};
  players.forEach((player, index) => {
    if (index === 0) {
      // Remove picture data from cards
      gameState.playerHands[player.idUser] = deck.slice(0, halfDeck).map(({id, suit, rank, value}) => ({
        id, suit, rank, value
      }));
    } else if (index === 1) {
      gameState.playerHands[player.idUser] = deck.slice(halfDeck).map(({id, suit, rank, value}) => ({
        id, suit, rank, value
      }));
    } else {
      gameState.playerHands[player.idUser] = [];
    }
  });
  
  // Update game state
  await updateGameState(gameId, gameState);
  
  // Notify all players
  notifyGameUsers(gameId, {
    type: "game_state",
    gameState
  });
}

// Helper function to send game state
async function sendGameState(gameId: number, ws: WebSocket) {
  try {
    const gameState = await getGameState(gameId);
    
    ws.send(JSON.stringify({
      type: "game_state",
      gameState
    }));
  } catch (error) {
    console.error("Error sending game state:", error);
  }
}

// Helper function to send connected users
async function sendConnectedUsers(gameId: number) {
  try {
    const usersInGame = await getUsersInGame(gameId);
    
    const connectedUsersData = await Promise.all(usersInGame.map(async (user) => {
      let ppPath = "";
      if (user.Profile_picture) {
        ppPath = bytesToDataURL(user.Profile_picture, "image/png");
      }
      
      return {
        id: user.idUser,
        username: user.Username,
        pp_path: ppPath,
        connected: connections.some(conn => conn.userId === user.idUser)
      };
    }));
    
    notifyGameUsers(gameId, {
      type: "connected_users",
      users: connectedUsersData
    });
  } catch (error) {
    console.error("Error sending connected users:", error);
  }
}

function notifyGameUsers(gameId: number, message: any) {
  console.log(`Broadcasting message to all users in game ${gameId}:`, message.type);
  let sentCount = 0;
  
  // Debug client game IDs with their types
  console.log("Client game IDs:", connections.map(c => 
    `${c.username}: ${c.gameId} (${typeof c.gameId})`
  ));
  
  connections.forEach((client) => {
    // Convert both to the same type for comparison
    if (Number(client.gameId) === Number(gameId)) {
      try {
        client.ws.send(JSON.stringify(message));
        sentCount++;
        console.log(`Message sent to user ${client.username} (ID: ${client.userId})`);
      } catch (error) {
        console.error(`Error sending message to client ${client.username}:`, error);
      }
    } else {
      console.log(`Skipping client ${client.username} - gameId doesn't match: ${client.gameId} !== ${gameId}`);
    }
  });
  
  console.log(`Message broadcast complete: sent to ${sentCount} clients out of ${connections.length} total connections`);
}

// Add an OPTIONS handler for the login route
router.options('/login', (ctx) => {
  ctx.response.headers.set("Access-Control-Allow-Origin", "http://localhost:8080");
  ctx.response.headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  ctx.response.headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization, Accept");
  ctx.response.headers.set("Access-Control-Allow-Credentials", "true");
  ctx.response.status = 204; // No content for OPTIONS
});

router.post('/login', checkIfAlreadyConnected, async (ctx) => {
  // Manual CORS headers for login endpoint
  ctx.response.headers.set("Access-Control-Allow-Origin", "http://localhost:8080");
  ctx.response.headers.set("Access-Control-Allow-Credentials", "true");
  
  const body = await ctx.request.body.json();
  const { username, password } = body;
  
  const user = await getUserByUsername(username);

  if (!user) {
    ctx.response.status = 401;
    ctx.response.body = { error: 'Invalid username or password' };
    return;
  }

  const result = await verifyPassword(password, user.Password);  if (!result) {
    ctx.response.status = 401;
    ctx.response.body = { error: 'Invalid username or password' };
    console.log('Invalid username or password');
    return;
  }
  
  const token = await create({ alg: 'HS512', typ: 'JWT' }, { 
    userName: user.Username, 
    userId: user.idUser 
  }, secretKey);

  removeTokenByUser(username);
  tokens[token] = username;

  ctx.response.status = 200;
  ctx.response.headers.set(
    'Set-Cookie',
    `auth_token=${token}; HttpOnly; SameSite=Strict; Max-Age=3600`,
  );
  ctx.response.body = { status: 'success', auth_token: token };
});

// Add an OPTIONS handler for the create_account route
router.options('/create_account', (ctx) => {
  ctx.response.headers.set("Access-Control-Allow-Origin", "http://localhost:8080");
  ctx.response.headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  ctx.response.headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization, Accept");
  ctx.response.headers.set("Access-Control-Allow-Credentials", "true");
  ctx.response.status = 204; // No content for OPTIONS
});

router.post('/create_account', async (ctx) => {
  // Manual CORS headers
  ctx.response.headers.set("Access-Control-Allow-Origin", "http://localhost:8080");
  ctx.response.headers.set("Access-Control-Allow-Credentials", "true");
  
  const body = await ctx.request.body.json();
  const { username, password, profilePicture, bio, favoriteSong } = body;

  console.log("Creating account for user:", username);
  console.log("Profile picture provided:", profilePicture ? "Yes" : "No");
  console.log("Bio provided:", bio ? "Yes" : "No");
  console.log("Favorite song provided:", favoriteSong ? "Yes" : "No");

  const existingUser = await getUserByUsername(username);
  if (existingUser) {
    console.log("Username already exists:", username);
    ctx.response.status = 400;
    ctx.response.body = { error: 'Username already exists' };
    return;
  }

  let profilePictureBytes: Uint8Array | null = null;

  // Convert base64 to bytes if profile picture was provided
  if (profilePicture) {
    try {
      console.log("Converting provided profile picture to binary");
      profilePictureBytes = base64ToBytes(profilePicture);
    } catch (error) {
      console.error('Error converting profile picture:', error);
      // If there's an error, we'll use null which will trigger default pic
      profilePictureBytes = null;
    }
  } else {
    console.log("Using default profile picture");
    // profilePictureBytes remains null - default will be used
  }

  try {
    // Use the updated createUser function with bio and favorite song
    const newUser = await createUser(
      username, 
      password, 
      profilePictureBytes,
      bio || null,
      favoriteSong || null
    );
    
    console.log("User created successfully:", newUser.idUser);

    ctx.response.status = 201;
    ctx.response.body = { status: 'success', user: { 
      idUser: newUser.idUser,
      Username: newUser.Username,
      isAdmin: newUser.isAdmin,
      Bio: newUser.Bio,
      Favorite_song: newUser.Favorite_song
    }};
  } catch (error) {
    console.error("Error creating user:", error);
    ctx.response.status = 500;
    ctx.response.body = { error: 'Failed to create account' };
  }
});

router.post("/create-game", authorizationMiddleware, async (ctx) => {
  ctx.response.headers.set("Access-Control-Allow-Origin", "http://localhost:8080");
  ctx.response.headers.set("Access-Control-Allow-Credentials", "true");
  
  try {
    const body = await ctx.request.body.json();
    const gameType = body.gameType || "war"; // Default to war game if not specified
    
    const userId = ctx.state.tokenData.userId;
    
    if (!userId) {
      ctx.response.status = 400;
      ctx.response.body = { error: "Missing user ID" };
      return;
    }
    
    // Check if user already has an active game
    const existingGame = await getActiveGameForUser(userId);
    if (existingGame) {
      // User already has a game, return it
      ctx.response.status = 200;
      ctx.response.body = { game: existingGame };
      return;
    }
    
    // Create initial game state based on type
    const initialState = await initializeGameState(0, gameType);
    
    // Create a new game with the specified type
    const result = await client.queryObject<{ idGame: number }>(
      'INSERT INTO "Game" ("GameType", "GameStatus", "GameState") VALUES ($1, $2, $3) RETURNING "idGame"',
      [
        gameType, 
        "active", 
        JSON.stringify(initialState)
      ]
    );
    
    const gameId = result.rows[0].idGame;
    
    // Add user to the game
    await addUserToGame(userId, gameId);
    
    // Get the game to return it
    const game = await client.queryObject<any>(
      'SELECT * FROM "Game" WHERE "idGame" = $1',
      [gameId]
    );
    
    ctx.response.status = 201;
    ctx.response.body = { game: game.rows[0] };
  } catch (error) {
    console.error("Error creating game:", error);
    ctx.response.status = 500;
    ctx.response.body = { error: "Failed to create game" };
  }
});

router.get('/get_cookie', async (ctx) => {
  // Manual CORS headers
  ctx.response.headers.set("Access-Control-Allow-Origin", "http://localhost:8080");
  ctx.response.headers.set("Access-Control-Allow-Credentials", "true");
  
  try {
    // Generate JWT token
    const token = await create({ alg: 'HS512', typ: 'JWT' }, { userName: 'dummy' }, secretKey);

    // Set the token in an HTTP-only cookie
    ctx.response.headers.set(
      'Set-Cookie',
      `auth_token=${token}; HttpOnly; SameSite=Strict; Max-Age=3600`,
    );

    // Return success
    ctx.response.status = 200;
    ctx.response.body = { success: true };
  } catch (_error) {
    ctx.response.status = 500;
    ctx.response.body = { error: 'Internal server error.' };
  }
});

router.get('/games', async (ctx) => {
  ctx.response.headers.set("Access-Control-Allow-Origin", "http://localhost:8080");
  ctx.response.headers.set("Access-Control-Allow-Credentials", "true");
  
  try {
    const activeGames = await getAllActiveGames();
    
    // For each game, get the players
    const gamesWithPlayers = await Promise.all(activeGames.map(async (game) => {
      const players = await getUsersInActiveGame(game.idGame);
      return {
        ...game,
        players: players.map(p => ({ 
          id: p.idUser,
          username: p.Username
        }))
      };
    }));
    
    ctx.response.status = 200;
    ctx.response.body = { games: gamesWithPlayers };
  } catch (error) {
    console.error('Error fetching active games:', error);
    ctx.response.status = 500;
    ctx.response.body = { error: 'Failed to fetch active games' };
  }
});

router.post('/finish-game', authorizationMiddleware, async (ctx) => {
  // Manual CORS headers
  ctx.response.headers.set("Access-Control-Allow-Origin", "http://localhost:8080");
  ctx.response.headers.set("Access-Control-Allow-Credentials", "true");
  
  const body = await ctx.request.body.json();
  const { gameId } = body;
  
  if (!gameId) {
    ctx.response.status = 400;
    ctx.response.body = { error: 'Missing game ID' };
    return;
  }
  
  try {
    await markGameAsFinished(gameId);
    ctx.response.status = 200;
    ctx.response.body = { success: true };
  } catch (error) {
    console.error(`Error finishing game ${gameId}:`, error);
    ctx.response.status = 500;
    ctx.response.body = { error: 'Failed to finish game' };
  }
});

// Enhanced active-game endpoint with player card counts
// Add OPTIONS handler for active-game
router.options('/active-game', (ctx) => {
  ctx.response.headers.set("Access-Control-Allow-Origin", "http://localhost:8080");
  ctx.response.headers.set("Access-Control-Allow-Methods", "GET, OPTIONS");
  ctx.response.headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization, Accept");
  ctx.response.headers.set("Access-Control-Allow-Credentials", "true");
  ctx.response.status = 204; // No content for OPTIONS
});

// Improve the active-game endpoint further
router.get('/active-game', async (ctx) => {
  // Set CORS headers first
  ctx.response.headers.set("Access-Control-Allow-Origin", "http://localhost:8080");
  ctx.response.headers.set("Access-Control-Allow-Credentials", "true");
  
  try {
    // Get token from multiple sources
    const cookie = ctx.request.headers.get('cookie');
    const authToken = cookie?.split('; ').find((row) => row.startsWith('auth_token='))?.split('=')[1];
    const headerToken = ctx.request.headers.get('Authorization')?.replace('Bearer ', '');
    
    const tokenToUse = authToken || headerToken;
    
    if (!tokenToUse) {
      console.log('No token provided for active-game check');
      ctx.response.status = 401;
      ctx.response.body = { error: 'Unauthorized: Missing token' };
      return;
    }
    
    // Verify token directly in this endpoint
    let tokenData;
    try {
      tokenData = await verify(tokenToUse, secretKey);
      console.log('Token verified in active-game endpoint:', tokenData);
    } catch (tokenError) {
      console.error('Token verification error:', tokenError);
      ctx.response.status = 401;
      ctx.response.body = { error: 'Unauthorized: Invalid token' };
      return;
    }
    
    const userId = tokenData.userId;
    if (!userId) {
      console.error('Token missing userId');
      ctx.response.status = 400;
      ctx.response.body = { error: 'Missing user ID in token' };
      return;
    }
    
    console.log(`Checking active game for user ${userId}`);
    
    // Check all games this user is part of
    const userGamesResult = await client.queryObject<{idGame: number}>(
      'SELECT gu."idGame" FROM "Game_Users" gu ' +
      'JOIN "Game" g ON gu."idGame" = g."idGame" ' +
      'WHERE gu."idUsers" = $1 AND g."GameStatus" = \'active\'',
      [userId]
    );
    
    console.log(`User ${userId} is part of ${userGamesResult.rows.length} active games`);
    
    // If user is not in any active games, return 404
    if (userGamesResult.rows.length === 0) {
      console.log(`No active games found for user ${userId}`);
      ctx.response.status = 404;
      ctx.response.body = { error: 'No active game found' };
      return;
    }
    
    // Get the most recent active game
    const gameIds = userGamesResult.rows.map(row => row.idGame);
    console.log('Active game IDs for user:', gameIds);
    
    const activeGameResult = await client.queryObject<Game>(
      'SELECT * FROM "Game" WHERE "idGame" = ANY($1::int[]) AND "GameStatus" = \'active\' ' +
      'ORDER BY "DateCreated" DESC LIMIT 1',
      [gameIds]
    );
    
    if (activeGameResult.rows.length === 0) {
      console.log(`No active games found for user ${userId} (double-check)`);
      ctx.response.status = 404;
      ctx.response.body = { error: 'No active game found' };
      return;
    }
    
    const activeGame = activeGameResult.rows[0];
    console.log(`Found active game ${activeGame.idGame} for user ${userId}`);
    
    // Double-check the game is indeed active
    if (activeGame.GameStatus !== 'active') {
      console.log(`Game ${activeGame.idGame} is not active, status: ${activeGame.GameStatus}`);
      ctx.response.status = 404;
      ctx.response.body = { error: 'No active game found' };
      return;
    }
    
    // Get players in this game
    const players = await getUsersInActiveGame(activeGame.idGame);
    const gameState = await getGameState(activeGame.idGame);

    ctx.response.status = 200;
    ctx.response.body = { 
      game: {
        ...activeGame,
        gameState: gameState
      }
    };
  } catch (error) {
    console.error('Error in active-game endpoint:', error);
    ctx.response.status = 500;
    ctx.response.body = { error: 'Internal server error' };
  }
});

// Add OPTIONS handler for join-game
router.options('/join-game', (ctx) => {
  ctx.response.headers.set("Access-Control-Allow-Origin", "http://localhost:8080");
  ctx.response.headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  ctx.response.headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization, Accept");
  ctx.response.headers.set("Access-Control-Allow-Credentials", "true");
  ctx.response.status = 204; // No content for OPTIONS
});

// Improved join-game endpoint with explicit type conversions
// Improved join-game endpoint with explicit type conversions
router.post('/join-game', async (ctx) => {
  // Set CORS headers first
  ctx.response.headers.set("Access-Control-Allow-Origin", "http://localhost:8080");
  ctx.response.headers.set("Access-Control-Allow-Credentials", "true");
  
  try {
    // Get token directly in this endpoint
    const cookie = ctx.request.headers.get('cookie');
    const authToken = cookie?.split('; ').find((row) => row.startsWith('auth_token='))?.split('=')[1];
    const headerToken = ctx.request.headers.get('Authorization')?.replace('Bearer ', '');
    
    const tokenToUse = authToken || headerToken;
    
    if (!tokenToUse) {
      console.log('No token provided for join-game');
      ctx.response.status = 401;
      ctx.response.body = { error: 'Unauthorized: Missing token' };
      return;
    }
    
    // Verify token
    let tokenData;
    try {
      tokenData = await verify(tokenToUse, secretKey);
      console.log('Token verified in join-game endpoint:', tokenData);
    } catch (tokenError) {
      console.error('Token verification error:', tokenError);
      ctx.response.status = 401;
      ctx.response.body = { error: 'Unauthorized: Invalid token' };
      return;
    }
    
    // Explicitly convert userId to number with proper type checking
    let userId: number;
    if (typeof tokenData.userId === 'number') {
      userId = tokenData.userId;
    } else if (typeof tokenData.userId === 'string') {
      userId = parseInt(tokenData.userId, 10);
      if (isNaN(userId)) {
        ctx.response.status = 400;
        ctx.response.body = { error: 'Invalid user ID format in token' };
        return;
      }
    } else {
      console.error('Token has invalid userId type:', typeof tokenData.userId);
      ctx.response.status = 400;
      ctx.response.body = { error: 'Missing or invalid user ID in token' };
      return;
    }
    
    const body = await ctx.request.body.json();
    
    // Explicitly convert gameId to number with proper type checking
    let gameId: number;
    if (typeof body.gameId === 'number') {
      gameId = body.gameId;
    } else if (typeof body.gameId === 'string') {
      gameId = parseInt(body.gameId, 10);
      if (isNaN(gameId)) {
        ctx.response.status = 400;
        ctx.response.body = { error: 'Invalid game ID format' };
        return;
      }
    } else {
      ctx.response.status = 400;
      ctx.response.body = { error: 'Missing game ID' };
      return;
    }
    
    console.log(`Processing join request for user ${userId} to game ${gameId}`);
    
    // Use the joinExistingGame function with explicit number types
    const success = await joinExistingGame(userId, gameId);
    
    if (!success) {
      ctx.response.status = 404;
      ctx.response.body = { error: 'Game not found or not active' };
      return;
    }
    
    // Set current game ID (also convert to number for consistency)
    currentGameId = gameId;
    
    ctx.response.status = 200;
    ctx.response.body = { 
      success: true, 
      message: 'Successfully joined game',
      gameId: gameId
    };
  } catch (error) {
    console.error(`Error in join-game endpoint:`, error);
    ctx.response.status = 500;
    ctx.response.body = { error: 'Internal server error' };
  }
});

router.post('/start-game', authorizationMiddleware, async (ctx) => {
  // Set CORS headers
  ctx.response.headers.set("Access-Control-Allow-Origin", "http://localhost:8080");
  ctx.response.headers.set("Access-Control-Allow-Credentials", "true");
  
  try {
    const body = await ctx.request.body.json();
    const { gameId } = body;
    
    if (!gameId) {
      ctx.response.status = 400;
      ctx.response.body = { error: 'Missing game ID' };
      return;
    }
    
    // Make sure the game exists
    const game = await getGameById(gameId);
    if (!game) {
      ctx.response.status = 404;
      ctx.response.body = { error: 'Game not found' };
      return;
    }
    
    // Check if user is in the game
    const userId = ctx.state.tokenData.userId;
    const usersInGame = await getUsersInGame(gameId);
    const userInGame = usersInGame.some(u => u.idUser === userId);
    
    if (!userInGame) {
      ctx.response.status = 403;
      ctx.response.body = { error: 'You are not in this game' };
      return;
    }
    
    // Start the game
    await startGame(gameId);
    
    ctx.response.status = 200;
    ctx.response.body = { success: true };
  } catch (error) {
    console.error('Error starting game:', error);
    ctx.response.status = 500;
    ctx.response.body = { 
      error: error instanceof Error ? error.message : 'Failed to start game' 
    };
  }
});

// Add OPTIONS handler for restart-game
router.options('/restart-game', (ctx) => {
  ctx.response.headers.set("Access-Control-Allow-Origin", "http://localhost:8080");
  ctx.response.headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  ctx.response.headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization, Accept");
  ctx.response.headers.set("Access-Control-Allow-Credentials", "true");
  ctx.response.status = 204; // No content for OPTIONS
});

// Add endpoint to restart a finished game
router.post('/restart-game', authorizationMiddleware, async (ctx) => {
  // Set CORS headers
  ctx.response.headers.set("Access-Control-Allow-Origin", "http://localhost:8080");
  ctx.response.headers.set("Access-Control-Allow-Credentials", "true");
  
  try {
    const body = await ctx.request.body.json();
    const { gameId } = body;
    
    if (!gameId) {
      ctx.response.status = 400;
      ctx.response.body = { error: 'Missing game ID' };
      return;
    }
    
    // Check if the game exists
    const gameCheck = await client.queryObject<{ GameStatus: string }>(
      'SELECT "GameStatus" FROM "Game" WHERE "idGame" = $1',
      [gameId]
    );
    
    if (gameCheck.rows.length === 0) {
      ctx.response.status = 404;
      ctx.response.body = { error: 'Game not found' };
      return;
    }
    
    // Check if user is in the game
    const userId = ctx.state.tokenData.userId;
    const usersInGame = await getUsersInGame(gameId);
    const userInGame = usersInGame.some(u => u.idUser === userId);
    
    if (!userInGame) {
      ctx.response.status = 403;
      ctx.response.body = { error: 'You are not in this game' };
      return;
    }
    
    // Update game status back to 'active'
    await client.queryObject(
      'UPDATE "Game" SET "GameStatus" = \'active\' WHERE "idGame" = $1',
      [gameId]
    );
    
    // Initialize a fresh game state with proper type assertion
    // Initialize a fresh game state with proper structure
    const gameState: GameState = {
      gameType: "war", // Add the required gameType property
      phase: 'setup' as 'waiting' | 'setup' | 'playing' | 'finished',
      currentTurn: null,
      round: 1,
      startTime: new Date(),
      lastActionTime: new Date(),
      playerHands: {},
      playedCards: {},
      lastWinner: null,
      // Move war-specific properties to warState
      warState: {
        warPile: [],
        inWar: false,
        warRound: 0
      }
    };
    
    // Update game state in database
    await updateGameState(gameId, gameState);
    
    // Re-initialize game with new cards
    await initializeGame(gameId);

    await startGame(gameId);
    
    // Notify all clients
    notifyGameUsers(gameId, {
      type: "game_restart",
      gameId: gameId
    });
    
    ctx.response.status = 200;
    ctx.response.body = { success: true };
  } catch (error) {
    console.error('Error restarting game:', error);
    ctx.response.status = 500;
    ctx.response.body = { 
      error: error instanceof Error ? error.message : 'Failed to restart game' 
    };
  }
});

// Add OPTIONS handler for disconnect-from-game
router.options('/disconnect-from-game', (ctx) => {
  ctx.response.headers.set("Access-Control-Allow-Origin", "http://localhost:8080");
  ctx.response.headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  ctx.response.headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization, Accept");
  ctx.response.headers.set("Access-Control-Allow-Credentials", "true");
  ctx.response.status = 204; // No content for OPTIONS
});

// Update disconnect-from-game endpoint to support navigator.sendBeacon
router.post('/disconnect-from-game', async (ctx) => {
  // Set CORS headers first
  ctx.response.headers.set("Access-Control-Allow-Origin", "http://localhost:8080");
  ctx.response.headers.set("Access-Control-Allow-Credentials", "true");
  
  try {
    // Get token from multiple sources including URL query for sendBeacon
    const cookie = ctx.request.headers.get('cookie');
    const authToken = cookie?.split('; ').find((row) => row.startsWith('auth_token='))?.split('=')[1];
    const headerToken = ctx.request.headers.get('Authorization')?.replace('Bearer ', '');
    
    // Check URL query parameters (for navigator.sendBeacon)
    const urlParams = ctx.request.url.searchParams;
    const queryToken = urlParams.get('auth_token');
    
    const tokenToUse = authToken || headerToken || queryToken;
    
    if (!tokenToUse) {
      console.log('No token provided for disconnect-from-game');
      ctx.response.status = 401;
      ctx.response.body = { error: 'Unauthorized: Missing token' };
      return;
    }
    
    // Verify token
    let tokenData;
    try {
      tokenData = await verify(tokenToUse, secretKey);
    } catch (tokenError) {
      console.error('Token verification error:', tokenError);
      ctx.response.status = 401;
      ctx.response.body = { error: 'Unauthorized: Invalid token' };
      return;
    }
    
    // Extract userId with proper type conversion
    let userId: number;
    if (typeof tokenData.userId === 'number') {
      userId = tokenData.userId;
    } else if (typeof tokenData.userId === 'string') {
      userId = parseInt(tokenData.userId, 10);
      if (isNaN(userId)) {
        console.error('Invalid userId format in token:', tokenData.userId);
        ctx.response.status = 400;
        ctx.response.body = { error: 'Invalid user ID format' };
        return;
      }
    } else {
      console.error('Token contains invalid userId type:', typeof tokenData.userId);
      ctx.response.status = 400;
      ctx.response.body = { error: 'Missing or invalid user ID in token' };
      return;
    }
    
    const username = tokenData.userName;
    
    if (!username) {
      console.error('Token missing userName');
      ctx.response.status = 400;
      ctx.response.body = { error: 'Missing username in token' };
      return;
    }
    
    console.log(`User ${username} (ID: ${userId}) explicitly disconnecting from game`);
    
    // Now userId is guaranteed to be a proper number
    // Get active game for this user
    const userActiveGame = await getActiveGameForUser(userId);
    
    if (!userActiveGame) {
      console.log(`No active game found for user ${username}`);
      ctx.response.status = 200; // Still return success to avoid errors during navigation
      ctx.response.body = { success: true, message: 'No active game found' };
      return;
    }
    
    const gameId = userActiveGame.idGame;
    
    // Find and remove this user's connection
    const connectionIndex = connections.findIndex(conn => conn.username === username);
    if (connectionIndex !== -1) {
      console.log(`Removing connection for user ${username}`);
      connections.splice(connectionIndex, 1);
    } else {
      console.log(`No active connection found for user ${username}`);
    }
    
    // Check if any other user from this game is still connected
    const usersInGame = await getUsersInGame(gameId);
    const anyUserStillConnected = usersInGame.some(user => 
      connections.some(conn => conn.username === user.Username)
    );
    
    // If no users are connected, mark the game as finished
    if (!anyUserStillConnected) {
      console.log(`No players connected to game ${gameId}, marking as finished`);
      await markGameAsFinished(gameId);
    } else {
      // Otherwise, notify remaining users
      const connectedUsers = usersInGame
        .filter(user => connections.some(conn => conn.username === user.Username))
        .map(user => {
          let ppPath = '';
          if (user.Profile_picture) {
            const base64String = safelyConvertToBase64(user.Profile_picture);
            ppPath = base64String ? `data:image/png;base64,${base64String}` : '';
          }
          
          return {
            username: user.Username,
            pp_path: ppPath
          };
        });
      
      // Notify all remaining connected users
      notifyGameUsers(gameId, { type: 'connected_users', users: connectedUsers });
    }
    
    ctx.response.status = 200;
    ctx.response.body = { success: true };
  } catch (error) {
    console.error('Error in disconnect-from-game endpoint:', error);
    ctx.response.status = 500;
    ctx.response.body = { error: 'Internal server error' };
  }
});

// Profile endpoint
router.post('/user-profile', authorizationMiddleware, async (ctx) => {
  ctx.response.headers.set("Access-Control-Allow-Origin", "http://localhost:8080");
  ctx.response.headers.set("Access-Control-Allow-Credentials", "true");
  
  try {
    const body = await ctx.request.body.json();
    const { username } = body;
    
    if (!username) {
      ctx.response.status = 400;
      ctx.response.body = { error: 'Username is required' };
      return;
    }
    
    // Get user from database
    const user = await getUserByUsername(username);
    
    if (!user) {
      ctx.response.status = 404;
      ctx.response.body = { error: 'User not found' };
      return;
    }
    
    // Convert profile picture to base64 if it exists
    let profilePictureBase64 = null;
    if (user.Profile_picture) {
      profilePictureBase64 = safelyConvertToBase64(user.Profile_picture);
    }
    
    // Return user data with profile picture as base64
    ctx.response.status = 200;
    ctx.response.body = {
      user: {
        idUser: user.idUser,
        Username: user.Username,
        Bio: user.Bio,
        Favorite_song: user.Favorite_song,
        Profile_picture: profilePictureBase64,
        isAdmin: user.isAdmin
      }
    };
  } catch (error) {
    console.error('Error fetching user profile:', error);
    ctx.response.status = 500;
    ctx.response.body = { error: 'Internal server error' };
  }
});

// Update profile endpoint
router.post('/update-profile', authorizationMiddleware, async (ctx) => {
  ctx.response.headers.set("Access-Control-Allow-Origin", "http://localhost:8080");
  ctx.response.headers.set("Access-Control-Allow-Credentials", "true");
  
  try {
    const body = await ctx.request.body.json();
    const { username, bio, favoriteSong, profilePicture } = body;
    
    // Get current user ID from token
    const userId = ctx.state.tokenData.userId;
    
    // Get user from database
    const user = await getUserById(userId);
    
    if (!user) {
      ctx.response.status = 404;
      ctx.response.body = { error: 'User not found' };
      return;
    }
    
    // Make sure user is only updating their own profile
    if (user.Username !== username) {
      ctx.response.status = 403;
      ctx.response.body = { error: 'You can only update your own profile' };
      return;
    }
    
    // Process profile picture if provided
    let profilePictureBytes = user.Profile_picture;
    if (profilePicture) {
      // Convert from base64 data URL
      profilePictureBytes = base64ToBytes(profilePicture);
    }
    
    // Update user in database
    const result = await client.queryObject<User>(
      'UPDATE "User" SET "Bio" = $1, "Favorite_song" = $2, "Profile_picture" = $3 WHERE "idUser" = $4 RETURNING *',
      [bio || null, favoriteSong || null, profilePictureBytes, userId]
    );
    
    if (result.rows.length === 0) {
      ctx.response.status = 500;
      ctx.response.body = { error: 'Failed to update profile' };
      return;
    }
    
    const updatedUser = result.rows[0];
    
    // Convert profile picture to base64 if it exists
    let profilePictureBase64 = null;
    if (updatedUser.Profile_picture) {
      profilePictureBase64 = safelyConvertToBase64(updatedUser.Profile_picture);
    }
    
    // Return updated user data
    ctx.response.status = 200;
    ctx.response.body = {
      user: {
        idUser: updatedUser.idUser,
        Username: updatedUser.Username,
        Bio: updatedUser.Bio,
        Favorite_song: updatedUser.Favorite_song,
        Profile_picture: profilePictureBase64,
        isAdmin: updatedUser.isAdmin
      }
    };
  } catch (error) {
    console.error('Error updating profile:', error);
    ctx.response.status = 500;
    ctx.response.body = { error: 'Internal server error' };
  }
});

// Add OPTIONS handler for user-profile
router.options('/user-profile', (ctx) => {
  ctx.response.headers.set("Access-Control-Allow-Origin", "http://localhost:8080");
  ctx.response.headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  ctx.response.headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization, Accept");
  ctx.response.headers.set("Access-Control-Allow-Credentials", "true");
  ctx.response.status = 204; // No content for OPTIONS
});

// Add OPTIONS handler for update-profile
router.options('/update-profile', (ctx) => {
  ctx.response.headers.set("Access-Control-Allow-Origin", "http://localhost:8080");
  ctx.response.headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  ctx.response.headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization, Accept");
  ctx.response.headers.set("Access-Control-Allow-Credentials", "true");
  ctx.response.status = 204; // No content for OPTIONS
});

// New endpoint to get all card resources
router.get("/api/cards", async (ctx) => {
  ctx.response.headers.set("Access-Control-Allow-Origin", "http://localhost:8080");
  ctx.response.headers.set("Access-Control-Allow-Credentials", "true");
  
  try {
    const cards = await cardService.getAllCardsWithMetadata();
    ctx.response.body = { cards };
  } catch (error) {
    console.error("Error loading card resources:", error);
    ctx.response.status = 500;
    ctx.response.body = { error: "Failed to load card resources" };
  }
});

interface TokenPayload {
  userName: string;
  userId: number;
  [key: string]: unknown;
}

router.get("/ws", async (ctx) => {
  if (!ctx.isUpgradable) {
    ctx.throw(501);
  }

  try {
    // Extract auth token from request
    const cookie = ctx.request.headers.get('cookie');
    const authToken = cookie?.split('; ').find((row) => row.startsWith('auth_token='))?.split('=')[1];
    const headerToken = ctx.request.headers.get('Authorization')?.replace('Bearer ', '');
    const tokenParam = ctx.request.url.searchParams.get('token');
    const tokenToUse = tokenParam || authToken || headerToken;
    
    if (!tokenToUse) {
      ctx.throw(401, "Unauthorized: Missing authentication token");
      return;
    }
    
    // Verify token with proper type assertion
    const tokenData = await verify(tokenToUse, secretKey) as TokenPayload;
    const username = tokenData.userName;
    const userId = tokenData.userId;
    
    if (!username || userId === undefined) {
      ctx.throw(401, "Invalid token format: missing username or userId");
      return;
    }

    console.log(`WebSocket connection attempt by user: ${username} (ID: ${userId})`);
    
    // Check if the user is already connected
    const isConnected = connections.some((conn) => conn.username === username);
    if (isConnected) {
      ctx.throw(403, "User is already connected");
      return;
    }

    // Upgrade to WebSocket
    const ws = ctx.upgrade();
    
    // Initialize gameId variable explicitly
    let currentGameId: number | null = null;
    
    // Check if user has an active game
    try {
      const activeGame = await getActiveGameForUser(userId);
      if (activeGame) {
        currentGameId = activeGame.idGame;
        console.log(`User ${username} has active game: ${currentGameId}`);
      }
    } catch (error) {
      console.error(`Error getting active game for user ${userId}:`, error);
    }
    
    // Add connection to the list with correct types
    connections.push({ 
      ws, 
      username: username, 
      gameId: currentGameId, 
      userId: userId 
    });
    
    console.log(`+ WebSocket connected: ${username} to game ${currentGameId || 'none'} (total: ${connections.length})`);
    
    // On WebSocket open, send initial data
    // 1. Send card back image
    const cardBackImage = await cardService.getCardBackImage();
    ws.send(JSON.stringify({
      type: "card_back",
      image: cardBackImage
    }));
    
    // 2. Send connected users
    if (currentGameId) {
      sendConnectedUsers(currentGameId);
      
      // 3. Send current game state
      sendGameState(currentGameId, ws);

    const gameConnections = connections.filter(conn => conn.gameId === currentGameId);
    console.log(`Current connections in game ${currentGameId}: ${gameConnections.length}`);
    gameConnections.forEach(conn => {
      console.log(`- User: ${conn.username}, ID: ${conn.userId}`);
  });
    }

    // WebSocket message handler
    ws.onmessage = async (event) => {
      try {
        const data = JSON.parse(event.data) as WebSocketMessage;
        
        // Verify auth token
        const authToken = data.auth_token;
        if (!is_authorized(authToken)) {
          console.log("Unauthorized WebSocket message");
          return;
        }
        
        // Handle messages
        switch (data.type) {
          case "join_game":
            handleJoinGame(data, userId, ws);
            break;
          
          case "player_action": {
            // First check if the cardId exists
            if (!data.action.cardId) {
              console.error("Missing cardId in player action");
              return;
            }
            
            // Get game state to determine the game type
            const gameState = await getGameState(data.gameId);
            if (!gameState) {
              console.error("Game state not found");
              return;
            }
            
            // Handle based on game type
            if (gameState.gameType === "war") {
              // Check if in war mode for special handling
              if (gameState && gameState.gameType === "war" && gameState.warState?.inWar) {
                // Special war card handling
                await handleWarCardPlay(data.gameId, userId, data.action.cardId);
              } else {
                // Normal card play for war game
                await handlePlayerAction(data, userId, username, ws);
              }
            } else {
              // Generic card game handling
              await handlePlayerAction(data, userId, username, ws);
            }
            break;
          }
          
          case "chat_message":
            handleChatMessage(data, userId, username);
            break;
          
          case "connected_users":
            sendConnectedUsers(data.gameId);
            break;
          
          case "game_state_request":
            sendGameState(data.gameId, ws);
            break;

          case "update_game_state":
            handleGameStateUpdate(data, userId, ws);
            break;

          case "update_round":
            handleRoundUpdate(data, userId, ws);
            break;

          case "turn_change":
            handleTurnChange(data, userId, username, ws);
            break;

          case "redirect_to_lobby":
            handleRedirectToLobby(data, userId, username);
            break;
        }
      } catch (error) {
        console.error("Error handling WebSocket message:", error);
        ws.send(JSON.stringify({
          type: "error",
          message: "Failed to process message"
        }));
      }
    };

    // WebSocket close handler
    ws.onclose = async () => {
      // Remove connection
      const index = connections.findIndex((conn) => conn.ws === ws);
      if (index !== -1) {
        const disconnectedUser = connections[index];
        connections.splice(index, 1);
        
        // Update connected users for this game
        if (disconnectedUser.gameId) {
          sendConnectedUsers(disconnectedUser.gameId);
        }
      }
      
      console.log(`- WebSocket disconnected (${connections.length} remaining)`);
    };

    // WebSocket error handler
    ws.onerror = (error) => {
      console.error("WebSocket error:", error);
    };

  } catch (error) {
    // Add error handling here
    console.error("Error in WebSocket connection:", error);
    ctx.response.status = 500;
    ctx.response.body = { error: "WebSocket connection error" };
  }
});
// the cookie is tested in the middleware (the cookie is provided by the browser in a header)
router.get('/test_cookie', authorizationMiddleware, (ctx) => {
  // Manual CORS headers
  ctx.response.headers.set("Access-Control-Allow-Origin", "http://localhost:8080");
  ctx.response.headers.set("Access-Control-Allow-Credentials", "true");
  
  ctx.response.body = { message: 'Token verified successfully', token_data: ctx.state.tokenData };
});

// Add custom CORS middleware
app.use(async (ctx, next) => {
  try {
    // Log the incoming request
    console.log(`${ctx.request.method} ${ctx.request.url.pathname} - Origin: ${ctx.request.headers.get("origin")}`);
    
    // Add CORS headers based on configuration
    const origin = ctx.request.headers.get("origin");
    let allowOrigin = '';
    
    // Set the appropriate origin header based on the request origin
    if (origin) {
      for (const allowedOrigin of config.allowedOrigins) {
        // Handle wildcard domains
        if (allowedOrigin.includes('*')) {
          const pattern = new RegExp(
            '^' + allowedOrigin.replace('.', '\\.').replace('*', '.*') + '$'
          );
          if (pattern.test(origin)) {
            allowOrigin = origin;
            break;
          }
        } 
        // Exact match
        else if (origin === allowedOrigin) {
          allowOrigin = origin;
          break;
        }
      }
    }
    
    // If no match was found, use the default frontend URL
    if (!allowOrigin) {
      allowOrigin = config.frontendUrl;
    }
    
    ctx.response.headers.set("Access-Control-Allow-Origin", allowOrigin);
    ctx.response.headers.set("Access-Control-Allow-Credentials", "true");
    ctx.response.headers.set("Access-Control-Allow-Methods", "GET,HEAD,PUT,POST,DELETE,PATCH,OPTIONS");
    ctx.response.headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization, Accept");
    
    // Handle preflight requests
    if (ctx.request.method === "OPTIONS") {
      console.log("Handling OPTIONS preflight request");
      ctx.response.status = 204; // No content for OPTIONS
      return;
    }
    
    await next();
  } catch (error) {
    console.error("CORS middleware error:", error);
    throw error; // Re-throw to be caught by the global error handler
  }
});

// Configure CORS options
const corsOptions: CorsOptions = {
  origin: config.allowedOrigins,
  credentials: true,
  allowMethods: ["GET", "POST", "PUT", "DELETE"],
  allowHeaders: ["Content-Type", "Authorization", "Accept"]
};

// Apply the cors middleware
// @ts-ignore: The 'cors' library is compatible but TypeScript may not recognize its type definitions
app.use(cors(corsOptions));

// Add global error handling middleware
app.use(async (ctx, next) => {
  try {
    await next();
  } catch (err) {
    console.error("Request error:", err);
    if (err instanceof Error && 'status' in err) {
      ctx.response.status = (err as { status?: number }).status || 500;
    } else {
      ctx.response.status = 500;
    }
    ctx.response.body = {
      error: err instanceof Error ? err.message : "Internal Server Error",
    };
  }
});

console.log(
  `Oak back server running on ${config.isProduction ? 'production' : 'development'} mode`,
  `Backend URL: ${config.backendUrl}`,
  `Allowed origins: ${config.allowedOrigins.join(', ')}`
);

app.use(router.routes());
app.use(router.allowedMethods());

// Use configuration from config.ts instead of command-line arguments
const PORT = config.isProduction ? Number(Deno.env.get('PORT')) : 3000;

const options: { port: number; hostname?: string; certFile?: string; keyFile?: string } = {
  port: PORT,
};

// Check for SSL config from environment variables
if (config.isProduction && Deno.env.get('SSL_CERT') && Deno.env.get('SSL_KEY')) {
  options.certFile = Deno.env.get('SSL_CERT');
  options.keyFile = Deno.env.get('SSL_KEY');
  console.log(`SSL configuration loaded from environment variables`);
}

await app.listen(options);