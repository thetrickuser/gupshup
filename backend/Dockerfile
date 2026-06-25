# 1. Build Stage
FROM gradle:9.3.0-jdk21-jammy AS builder
WORKDIR /workspace

# Copy gradlew executable
COPY gradlew ./

# Explicitly create the destination path to prevent directory flattening
RUN mkdir -p gradle/wrapper
COPY gradle/wrapper/gradle-wrapper.properties gradle/wrapper/gradle-wrapper.jar ./gradle/wrapper/

# Copy build files
COPY build.gradle settings.gradle gradle.properties ./

# Pre-download dependencies (This layer will be cached unless build files change)
RUN ./gradlew dependencies --no-daemon

# Copy source code and build
COPY src src
RUN ./gradlew bootJar --no-daemon

# 2. Run Stage
FROM eclipse-temurin:21-jre-jammy
WORKDIR /app

RUN addgroup --system spring && adduser --system spring --ingroup spring
USER spring:spring

COPY --from=builder /workspace/build/libs/*.jar app.jar

ENV PORT=8080
EXPOSE 8080

ENTRYPOINT ["java", "-jar", "/app/app.jar", "--server.port=${PORT:-8080}"]