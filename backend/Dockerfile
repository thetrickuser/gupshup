FROM gradle:9.6.0-jdk21-ubi AS builder
WORKDIR /workspace

COPY gradlew gradlew
COPY gradle gradle
COPY build.gradle settings.gradle gradle.properties ./
COPY src src

RUN chmod +x gradlew
RUN ./gradlew --no-daemon clean bootJar

FROM eclipse-temurin:21-jre-jammy
WORKDIR /app

COPY --from=builder /workspace/build/libs/*.jar /app/app.jar

ENV PORT=8080
EXPOSE 8080

ENTRYPOINT ["sh", "-c", "java -jar /app/app.jar --server.port=${PORT:-8080}"]
