# Backend container: builds the Spring Boot fat jar, then runs it on a JRE.
#
# The build stage runs as a separate layer so the dependency cache survives source changes.

# ---- Build stage ------------------------------------------------------------
FROM eclipse-temurin:17-jdk-alpine AS build

WORKDIR /build

# Copy the wrapper and POM first so dependencies are downloaded only when they change.
COPY mvnw .
COPY .mvn .mvn
COPY pom.xml .
RUN chmod +x mvnw && ./mvnw -B dependency:go-offline

COPY src src
# Tests are skipped here: `mvn verify` runs them in CI, and repeating them inside the
# image build doubles build time for no additional signal.
RUN ./mvnw -B clean package -DskipTests

# ---- Runtime stage ----------------------------------------------------------
FROM eclipse-temurin:17-jre-alpine AS runtime

# A dedicated unprivileged account. Running a JVM as root inside a container is an
# unnecessary privilege escalation path.
RUN addgroup -S app && adduser -S app -G app

WORKDIR /app

COPY --from=build /build/target/*.jar app.jar
RUN chown -R app:app /app

USER app

EXPOSE 8080

# Container-aware heap sizing, plus a couple of JVM flags that matter in containers:
#   MaxRAMPercentage     — size the heap from the container limit, not the host's RAM
#   UseContainerSupport  — read cgroup limits (on by default, stated for clarity)
#   ExitOnOutOfMemory    — fail fast and let the orchestrator restart, rather than
#                          limping along in a half-broken state
ENV JAVA_OPTS="-XX:MaxRAMPercentage=75 -XX:+ExitOnOutOfMemoryError -Djava.security.egd=file:/dev/./urandom"

HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
    CMD wget --quiet --tries=1 --spider http://localhost:8080/actuator/health || exit 1

ENTRYPOINT ["sh", "-c", "exec java $JAVA_OPTS -jar app.jar"]
