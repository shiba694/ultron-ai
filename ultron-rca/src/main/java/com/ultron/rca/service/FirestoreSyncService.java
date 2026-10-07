package com.ultron.rca.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.google.auth.oauth2.AccessToken;
import com.google.auth.oauth2.GoogleCredentials;
import com.ultron.rca.entity.Incident;
import com.ultron.rca.model.RCAResponse;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;

import java.time.Instant;
import java.util.Collections;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * FirestoreSyncService — Asynchronous Dual-Write Cloud Broadcast.
 *
 * Implements the CQRS pattern:
 *  - Primary ACID data store: PostgreSQL (written first)
 *  - Real-time client broadcast layer: Google Cloud Firestore (written asynchronously)
 *
 * Authenticates seamlessly on GCP using Application Default Credentials (ADC)
 * without requiring any hardcoded API keys.
 */
@Slf4j
@Service
public class FirestoreSyncService {

    private final RestTemplate restTemplate;
    private final ObjectMapper objectMapper;
    private final ExecutorService executor = Executors.newSingleThreadExecutor();

    @Value("${firestore.enabled:true}")
    private boolean enabled;

    @Value("${firestore.project-id:${GCP_PROJECT_ID:ultron-ai-cloud}}")
    private String projectId;

    @Value("${firestore.database-id:(default)}")
    private String databaseId;

    @Value("${firestore.collection:incidents}")
    private String collection;

    public FirestoreSyncService(ObjectMapper objectMapper) {
        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(4000);
        factory.setReadTimeout(5000);
        this.restTemplate = new RestTemplate(factory);
        this.objectMapper = objectMapper;
    }

    /**
     * Broadcasts an incident to Google Cloud Firestore asynchronously.
     * Guaranteed non-blocking: never fails the main transaction or pipeline.
     */
    public CompletableFuture<Void> syncIncidentAsync(Incident incident, RCAResponse rcaResponse) {
        if (!enabled) {
            log.debug("Firestore sync disabled via configuration.");
            return CompletableFuture.completedFuture(null);
        }

        return CompletableFuture.runAsync(() -> {
            try {
                String token = getOAuth2Token();
                if (token == null || token.isBlank()) {
                    log.debug("Firestore sync skipped: Google ADC credentials not active (running locally).");
                    return;
                }

                String documentId = incident.getIncidentNumber() != null ? incident.getIncidentNumber() : incident.getIncidentId().toString();
                String endpointUrl = String.format(
                        "https://firestore.googleapis.com/v1/projects/%s/databases/%s/documents/%s/%s",
                        projectId, databaseId, collection, documentId
                );

                HttpHeaders headers = new HttpHeaders();
                headers.setContentType(MediaType.APPLICATION_JSON);
                headers.setBearerAuth(token);

                // Build Firestore Document format (Native Typed Fields)
                ObjectNode docNode = objectMapper.createObjectNode();
                ObjectNode fields = docNode.putObject("fields");

                putString(fields, "incidentId", incident.getIncidentId() != null ? incident.getIncidentId().toString() : "");
                putString(fields, "incidentNumber", incident.getIncidentNumber() != null ? incident.getIncidentNumber() : "");
                putString(fields, "serviceName", incident.getServiceName() != null ? incident.getServiceName() : "");
                putString(fields, "title", incident.getTitle() != null ? incident.getTitle() : "");
                putString(fields, "severity", incident.getSeverity() != null ? incident.getSeverity() : "P2");
                putString(fields, "status", incident.getStatus() != null ? incident.getStatus() : "INVESTIGATED");
                putString(fields, "rootCause", incident.getRootCause() != null ? incident.getRootCause() : "");
                putString(fields, "rcaSummary", incident.getRcaSummary() != null ? incident.getRcaSummary() : "");
                putString(fields, "suggestedFix", incident.getSuggestedFix() != null ? incident.getSuggestedFix() : "");
                putString(fields, "impactAnalysis", incident.getImpactAnalysis() != null ? incident.getImpactAnalysis() : "");
                putString(fields, "prevention", incident.getPrevention() != null ? incident.getPrevention() : "");
                putString(fields, "detectedAt", incident.getDetectedAt() != null ? incident.getDetectedAt().toString() : Instant.now().toString());
                putString(fields, "createdAt", incident.getCreatedAt() != null ? incident.getCreatedAt().toString() : Instant.now().toString());
                putDouble(fields, "confidence", incident.getConfidence() != null ? incident.getConfidence() : 0.95);
                putString(fields, "syncedAt", Instant.now().toString());

                HttpEntity<String> entity = new HttpEntity<>(objectMapper.writeValueAsString(docNode), headers);
                restTemplate.exchange(endpointUrl, HttpMethod.PATCH, entity, String.class);

                log.info("🔥 Successfully synced incident {} to Google Cloud Firestore (collection: {})",
                        documentId, collection);

            } catch (Exception e) {
                log.warn("⚠️ Non-fatal Firestore sync notice: {}", e.getMessage());
            }
        }, executor);
    }

    private void putString(ObjectNode fields, String key, String value) {
        ObjectNode valObj = fields.putObject(key);
        valObj.put("stringValue", value != null ? value : "");
    }

    private void putDouble(ObjectNode fields, String key, Double value) {
        ObjectNode valObj = fields.putObject(key);
        valObj.put("doubleValue", value != null ? value : 0.0);
    }

    private String getOAuth2Token() {
        try {
            GoogleCredentials credentials = GoogleCredentials.getApplicationDefault()
                    .createScoped(Collections.singletonList("https://www.googleapis.com/auth/datastore"));
            credentials.refreshIfExpired();
            AccessToken token = credentials.getAccessToken();
            return token != null ? token.getTokenValue() : null;
        } catch (Exception e) {
            log.trace("Could not obtain ADC token for Firestore: {}", e.getMessage());
            return null;
        }
    }
}
