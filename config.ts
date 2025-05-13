export const isProduction = !!Deno.env.get('PORT');

// Base URLs for backend and frontend
export const backendPort = isProduction 
  ? Deno.env.get('PORT') || '8080' 
  : '3000';

export const frontendPort = isProduction 
  ? '' // In production, frontend is at a different domain
  : '8080';

// Get the host (domain) - Dokku or Heroku provide this
export const host = isProduction 
  ? Deno.env.get('APP_DOMAIN') || 'localhost'
  : 'localhost';

// Build the complete URLs with prioritized environment variables for Dokku
export const backendUrl = isProduction 
  ? Deno.env.get('BACKEND_URL') || `https://${host}`
  : `http://${host}:${backendPort}`;

export const frontendUrl = isProduction 
  ? `http://caracaca-frontend-ig3.igpolytech.fr`
  : `http://${host}:${frontendPort}`;

// For CORS configuration - allowable origins
export const allowedOrigins = isProduction 
  ? [
      frontendUrl
    ] 
  : [`http://${host}:${frontendPort}`, `http://localhost:${frontendPort}`];

// For WebSocket connection URLs
export const websocketUrl = isProduction 
  ? Deno.env.get('WEBSOCKET_URL') || `wss://${host}`
  : `ws://${host}:${backendPort}`;

// Database configuration that handles Dokku's DATABASE_URL
export const dbConfig = () => {
  if (Deno.env.get('DATABASE_URL')) {
    try {
      const dbUrl = new URL(Deno.env.get('DATABASE_URL') || '');
      return {
        user: dbUrl.username,
        password: decodeURIComponent(dbUrl.password),
        database: dbUrl.pathname.substring(1), // Remove leading slash
        hostname: dbUrl.hostname,
        port: Number(dbUrl.port) || 5432,
        ssl: isProduction ? { rejectUnauthorized: false } : undefined
      };
    } catch (error) {
      console.error('Error parsing DATABASE_URL:', error);
      // Fall back to individual settings
    }
  }
  
  // Fall back to individual environment variables
  return {
    user: Deno.env.get('DB_USER') || 'marius',
    password: Deno.env.get('DB_PASSWORD') || 'caracaca123',
    database: Deno.env.get('DB_NAME') || 'CaraData',
    hostname: Deno.env.get('DB_HOST') || 'localhost',
    port: Number(Deno.env.get('DB_PORT') || '5432'),
    ssl: isProduction ? { rejectUnauthorized: false } : undefined
  };
};

// Log the configuration when imported (helps with debugging)
console.log('App Configuration:', {
  environment: isProduction ? 'production' : 'development',
  backendUrl,
  frontendUrl,
  allowedOrigins,
  websocketUrl,
  dbConfig: isProduction ? 'DATABASE_URL configured' : dbConfig()
});