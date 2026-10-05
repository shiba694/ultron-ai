package com.ultron.common.dto;

import com.fasterxml.jackson.annotation.JsonFormat;
import com.ultron.common.enums.AnomalyType;
import com.ultron.common.enums.Severity;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;
import java.util.UUID;

/**
 * AnomalyDTO — published to Kafka topic: anomaly-events
 * Produced by ultron-detector, consumed by ultron-rca
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class AnomalyDTO {

    @Builder.Default
    private String anomalyId = UUID.randomUUID().toString();

    @JsonFormat(pattern = "yyyy-MM-dd'T'HH:mm:ss.SSS")
    private LocalDateTime detectedAt;

    private String serviceName;
    private AnomalyType anomalyType;
    private Severity severity;
    private String metricName;       // e.g., "error_rate", "latency_ms", "request_count"
    private Double expectedValue;    // Baseline / mean
    private Double actualValue;      // Current observed value
    private Double zScore;           // Standard deviations from mean
    private Integer windowMinutes;   // Detection window (default: 5)
}
