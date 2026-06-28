package com.gupshup.relay.controller;

import java.util.HashMap;
import java.util.Map;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class StatusController {

    private static final Logger log = LoggerFactory.getLogger(StatusController.class);

    @GetMapping("/health")
    public ResponseEntity<Map<String, String>> checkHealth() {
        Map<String, String> status = new HashMap<>();
        status.put("status", "UP");
        status.put("message", "Gupshup backend cluster is fully operational");
        status.put("timestamp", String.valueOf(System.currentTimeMillis()));
        log.info("Health check endpoint called. Status: {}", status);
        return ResponseEntity.ok(status);
    }


}
