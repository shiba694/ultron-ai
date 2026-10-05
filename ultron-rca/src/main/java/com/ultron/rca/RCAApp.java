package com.ultron.rca;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableScheduling;

/**
 * RCAApp — ultron-rca
 *
 * Consumes anomaly-events from Kafka, gathers raw log context,
 * calls OpenRouter LLM for root cause analysis, persists the incident,
 * and publishes incident-events to Kafka for downstream alerting.
 */
@SpringBootApplication
@EnableScheduling
public class RCAApp {

    public static void main(String[] args) {
        SpringApplication.run(RCAApp.class, args);
    }
}