-- Simplified Schema (db/init/init-db.sql)

-- First drop unnecessary tables
DROP TABLE IF EXISTS "ActiveCards" CASCADE;
DROP TABLE IF EXISTS "GamesResults" CASCADE;
DROP TABLE IF EXISTS "Cards" CASCADE;

-- Keep core tables with simplified structure
CREATE TABLE IF NOT EXISTS "User" (
    "idUser" SERIAL PRIMARY KEY,
    "Username" VARCHAR(50) NOT NULL UNIQUE,
    "Password" VARCHAR(255) NOT NULL,
    "Profile_picture" BYTEA,
    "isAdmin" BOOLEAN DEFAULT FALSE,
    "Bio" TEXT,
    "Favorite_song" VARCHAR(255)
);

CREATE TABLE IF NOT EXISTS "Game" (
    "idGame" SERIAL PRIMARY KEY,
    "DateCreated" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    "GameType" VARCHAR(50) NOT NULL,
    "GameStatus" VARCHAR(20) DEFAULT 'active',
    -- Store minimal game state as JSON
    "GameState" JSONB,
    CONSTRAINT check_game_type
        CHECK ("GameType" IN ('classic', 'war', 'poker')),
    CONSTRAINT check_game_status
        CHECK ("GameStatus" IN ('active', 'finished', 'canceled'))
);

CREATE TABLE IF NOT EXISTS "Game_Users" (
    "idUsers" INT REFERENCES "User"("idUser") ON DELETE CASCADE,
    "idGame" INT REFERENCES "Game"("idGame") ON DELETE CASCADE,
    PRIMARY KEY ("idUsers", "idGame")
);

-- Keep Cards table for initial loading
CREATE TABLE IF NOT EXISTS "Cards" (
    "idCardType" SERIAL PRIMARY KEY,
    "Picture" BYTEA NOT NULL
);

-- Keep ChatMessages for persistent chat history
CREATE TABLE IF NOT EXISTS "ChatMessages" (
    "idMessages" SERIAL PRIMARY KEY,
    "idGame" INT REFERENCES "Game"("idGame") ON DELETE CASCADE,
    "idUser" INT REFERENCES "User"("idUser") ON DELETE SET NULL,
    "TextContent" TEXT NOT NULL,
    "Timestamp" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for improved performance
CREATE INDEX IF NOT EXISTS idx_game_status ON "Game" ("GameStatus");
CREATE INDEX IF NOT EXISTS idx_game_users ON "Game_Users" ("idUsers", "idGame");
CREATE INDEX IF NOT EXISTS idx_chat_messages_game ON "ChatMessages" ("idGame");
