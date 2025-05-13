import { Client } from "postgres";
import { convertImageToBytes } from "./convertIMG.ts";

function getEnv(key: string): string {
  const val = Deno.env.get(key);
  if (!val) throw new Error(`Missing env var: ${key}`);
  return val;
}

// Connect to your PostgreSQL database using environment variables
const client = new Client({
  user: getEnv('DB_USER'),
  password: getEnv('DB_PASSWORD'),
  database: getEnv('DB_NAME'),
  hostname: getEnv('DB_HOST'),
  port: Number(getEnv('DB_PORT')),
});

// Function to check if cards already exist
async function cardsExist(): Promise<boolean> {
  await client.connect();
  const result = await client.queryObject<{ count: number }>(
    'SELECT COUNT(*) as count FROM "Cards"'
  );
  const count = result.rows[0].count;
  console.log(`Found ${count} cards in database`);
  return count > 0;
}

async function insertCards() {
  try {
    // Check if cards already exist
    if (await cardsExist()) {
      console.log("Cards already exist in database, skipping insertion");
      await client.end();
      return;
    }

    // List of suits and ranks
    const suits = ["hearts", "diamonds", "clubs", "spades"];
    const ranks = [
      "2", "3", "4", "5", "6", "7", "8", "9", "10",
      "jack", "queen", "king", "ace",
    ];

    console.log("Starting card insertion...");

    // Insert all 52 standard cards
    let cardId = 1;
    for (const suit of suits) {
      for (const rank of ranks) {
        const id = `${rank}_of_${suit}`;
        const path = `/app/cards_images/${id}.png`;
        try {
          console.log(`Reading image ${path}`);
          // Use convertImageToBytes from convertIMG.ts instead of readImageAsBytes
          const imageBytes = await convertImageToBytes(path);
          
          // Insert into the Cards table (card types)
          await client.queryObject(
            'INSERT INTO "Cards" ("idCardType", "Picture") VALUES ($1, $2)',
            [cardId, imageBytes],
          );
          console.log(`Inserted ${id} with ID ${cardId}`);
          cardId++;
        } catch (err) {
          console.error(`Failed to insert ${id}:`, (err as Error).message);
        }
      }
    }

    // Insert joker and back of card
    const specialCards = ["red_joker", "card_back_blue"];
    for (const name of specialCards) {
      const path = `/app/cards_images/${name}.png`;
      try {
        // Use convertImageToBytes from convertIMG.ts
        const imageBytes = await convertImageToBytes(path);
        await client.queryObject(
          'INSERT INTO "Cards" ("idCardType", "Picture") VALUES ($1, $2)',
          [cardId, imageBytes],
        );
        console.log(`Inserted ${name} with ID ${cardId}`);
        cardId++;
      } catch (err) {
        console.error(`Failed to insert ${name}:`, (err as Error).message);
      }
    }

    console.log("Card insertion complete!");
  } catch (error) {
    console.error("Error in card insertion process:", (error as Error).message);
  } finally {
    await client.end();
  }
}

// Run the insertion process
insertCards();