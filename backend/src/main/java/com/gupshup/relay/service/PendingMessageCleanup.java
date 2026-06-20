package com.gupshup.relay.service;

import com.gupshup.relay.repo.MessageRepository;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.Instant;
import java.time.temporal.ChronoUnit;

@Component
public class PendingMessageCleanup {

    private final MessageRepository repository;

    public PendingMessageCleanup(MessageRepository repository) {
        this.repository = repository;
    }

    // run every 5 minutes
    @Scheduled(fixedRate = 300000)
    public void flushExpired() {
        Instant cutoff = Instant.now().minus(24, ChronoUnit.HOURS);
        repository.deleteOlderThan(cutoff);
    }
}
