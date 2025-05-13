FROM denoland/deno:1.41.0

WORKDIR /app

# Copy source code
COPY . .

# Create directory for card images 
RUN mkdir -p /app/cards_images

# Use RUN with shell command instead of COPY for conditional copy with error handling
RUN if [ -d "./cards_images" ] && [ "$(ls -A ./cards_images 2>/dev/null)" ]; then \
    cp -r ./cards_images/* /app/cards_images/ || echo "No card images to copy"; \
  else \
    echo "No cards_images directory or it's empty"; \
  fi

# Cache dependencies
RUN deno cache back_server.ts

# Using JSON array format
CMD ["deno", "run", "--allow-net", "--allow-read=.", "--allow-env", "back_server.ts"]