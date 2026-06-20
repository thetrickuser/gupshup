package com.gupshup.relay.repo;

import com.gupshup.relay.model.PendingMessage;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

public interface MessageRepository extends JpaRepository<PendingMessage, UUID> {

    List<PendingMessage> findByToUser(String toUser);

    @Transactional
    @Modifying
    @Query("DELETE FROM PendingMessage p WHERE p.createdAt < ?1")
    void deleteOlderThan(Instant cutoff);
}
