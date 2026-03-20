# ── Stage 1: Build ─────────────────────────────────────────────────
FROM amazoncorretto:21-alpine AS build

WORKDIR /app

COPY gradlew .
COPY gradle/ gradle/
COPY build.gradle.kts .
COPY settings.gradle .

RUN chmod +x gradlew

# Download dependencies (cached layer)
RUN ./gradlew dependencies --no-daemon

# Copy source and build
COPY src/ src/
RUN ./gradlew bootJar --no-daemon -x test

# ── Stage 2: Runtime ───────────────────────────────────────────────
FROM amazoncorretto:21-alpine

WORKDIR /app

# curl needed for container health check
RUN apk add --no-cache curl

# Non-root user
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

COPY --from=build /app/build/libs/app.jar app.jar

RUN chown appuser:appgroup app.jar

USER appuser

EXPOSE 8080

ENTRYPOINT ["java", \
  "-XX:MaxRAMPercentage=75", \
  "-XX:+UseContainerSupport", \
  "-jar", "app.jar"]
