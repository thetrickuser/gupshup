# 1. Build Stage
FROM gradle:9.3.0-jdk21-jammy AS builder
WORKDIR /workspace

# Copy build configuration files directly
COPY build.gradle settings.gradle gradle.properties ./

# Pre-download dependencies using the container's built-in global gradle installation
RUN gradle dependencies --no-daemon

# Copy source code and compile the bootable Jar
COPY src src
RUN gradle bootJar --no-daemon

# 2. Run Stage
FROM eclipse-temurin:21-jre-jammy
WORKDIR /app

RUN addgroup --system spring && adduser --system spring --ingroup spring
USER spring:spring

COPY --from=builder /workspace/build/libs/*.jar app.jar

ENV PORT=8080
EXPOSE 8080

ENTRYPOINT ["java", "-jar", "/app/app.jar", "--server.port=${PORT:-8080}"]