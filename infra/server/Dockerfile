# syntax = docker/dockerfile:1

# Adjust BUN_VERSION as desired
ARG BUN_VERSION=1.1.34
FROM oven/bun:${BUN_VERSION}-slim AS base

LABEL fly_launch_runtime="Bun"

# Bun app lives here
WORKDIR /app

# Set production environment
ENV NODE_ENV="production"


# Throw-away build stage to reduce size of final image
FROM base AS build

# Install packages needed to build node modules
RUN apt-get update -qq && \
    apt-get install --no-install-recommends -y build-essential pkg-config python-is-python3

# Copy application code
COPY . .
RUN bun install


# Build application
RUN bun run --filter backend server:build

# Final stage for app image
FROM base

# Copy built application
COPY --from=build /app/backend/out /app

# Start the server by default, this can be overwritten at runtime
EXPOSE 3000
CMD [ "bun", "server.js" ]
