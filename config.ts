// backend/config.ts
// Configuration module for environment-specific settings

// Determine if we're in a production environment
// Heroku sets the PORT environment variable automatically
export const isProduction = !!Deno.env.get('PORT');

// Base URLs for backend and frontend
export const backendPort = isProduction 
  ? Deno.env.get('PORT') || '8080' 
  : '3000';

export const frontendPort = isProduction 
  ? '' // In production, frontend may be served by the same server or at a different domain
  : '8080';

// Get the host (domain) - Heroku provides this in the HOST env var
export const host = isProduction 
  ? Deno.env.get('APP_DOMAIN') || '<your-app-name>.herokuapp.com' 
  : 'localhost';

// Build the complete URLs
export const backendUrl = isProduction 
  ? `https://${host}` 
  : `http://${host}:${backendPort}`;

export const frontendUrl = isProduction 
  ? 'https://' + (Deno.env.get('FRONTEND_URL') || host)
  : `http://${host}:${frontendPort}`;

// For CORS configuration - allowable origins
export const allowedOrigins = isProduction 
  ? [
      frontendUrl, 
      `https://caracaca-frontend-app-a3a330139af1.herokuapp.com/`
    ] 
  : [`http://${host}:${frontendPort}`, `http://localhost:${frontendPort}`];

// For WebSocket connection URLs
export const websocketUrl = isProduction 
  ? `wss://${host}` 
  : `ws://${host}:${backendPort}`;

// Log the configuration when imported (helps with debugging)
console.log('App Configuration:', {
  environment: isProduction ? 'production' : 'development',
  backendUrl,
  frontendUrl,
  allowedOrigins,
  websocketUrl
});
