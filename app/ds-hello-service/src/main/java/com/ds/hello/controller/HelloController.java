package com.ds.hello.controller;

import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

@Slf4j
@RestController
public class HelloController {

    @Autowired
    private JdbcTemplate jdbcTemplate;

    // ── GET /hello ────────────────────────────────────────────────────
    // Basic sanity check — proves Spring Boot is running
    @GetMapping("/hello")
    public Map<String, String> hello() {
        log.info("GET /hello called");
        return Map.of(
            "message", "Hello World",
            "service", "ds-hello-service",
            "status",  "ok"
        );
    }

    // ── GET /db ───────────────────────────────────────────────────────
    // Proves ECS → RDS connection is working end-to-end
    @GetMapping("/db")
    public Map<String, Object> dbCheck() {
        log.info("GET /db called — testing RDS connection");
        try {
            // Run a simple query against PostgreSQL
            String dbName    = jdbcTemplate.queryForObject(
                                   "SELECT current_database()", String.class);
            String dbVersion = jdbcTemplate.queryForObject(
                                   "SELECT version()", String.class);

            log.info("RDS connection successful — db: {}", dbName);
            return Map.of(
                "status",  "connected",
                "db",      dbName,
                "version", dbVersion
            );
        } catch (Exception ex) {
            log.error("RDS connection failed: {}", ex.getMessage());
            return Map.of(
                "status",  "error",
                "message", ex.getMessage()
            );
        }
    }
}
