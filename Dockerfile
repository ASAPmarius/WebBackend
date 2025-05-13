FROM denoland/deno:1.41.0

WORKDIR /app

# Copy source code (except lockfile)
COPY . .

# Remove the lockfile to prevent version issues
RUN rm -f deno.lock

# Cache the dependencies without lockfile
RUN deno cache --reload back_server.ts
RUN deno cache --reload insert_cards.ts
RUN deno cache --reload convertIMG.ts

# Create directory for card images (if it doesn't exist)
RUN mkdir -p /app/cards_images

# The command will be provided by docker-compose.yml
ENTRYPOINT ["deno"]
