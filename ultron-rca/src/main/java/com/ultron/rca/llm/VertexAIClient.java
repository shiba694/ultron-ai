package com.ultron.rca.llm;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.google.auth.oauth2.AccessToken;
import com.google.auth.oauth2.GoogleCredentials;
import com.ultron.rca.model.RCAResponse;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.*;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestTemplate;

import java.util.Collections;

/**
 * Google Cloud Vertex AI (Gemini) Client.
 *
 * Designed for production GCP deployments using:
 * 1. Application Default Credentials (ADC) — seamlessly authenticated via the
 *    Compute Engine VM's attached Service Account without requiring any API keys.
 * 2. Optional direct API Key fallback (Gemini Developer API) for local testing.
 * 3. Native JSON output enforcement via generationConfig (responseMimeType: "application/json").
 */
@Slf4j
@Component
public class VertexAIClient implements LLMClient {

    private final RestTemplate restTemplate;
    private final ObjectMapper objectMapper;

    @Value("${llm.vertex.project-id:ultron-ai-cloud}")
    private String projectId;

    @Value("${llm.vertex.location:us-central1}")
    private String location;

    @Value("${llm.vertex.model:gemini-3.8-flash}")
    private String model;

    @Value("${llm.vertex.api-key:}")
    private String apiKey;

    @Value("${llm.vertex.timeout-seconds:20}")
    private int timeoutSeconds;

    public VertexAIClient(ObjectMapper objectMapper) {
        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(5000);
        factory.setReadTimeout(20000);
        this.restTemplate = new RestTemplate(factory);
        this.objectMapper = objectMapper;
    }

    @Override
    public RCAResponse generateRCA(String prompt) {
        log.info("🤖 Generating RCA via Vertex AI (model: {}, project: {}, location: {})...", model, projectId, location);

        try {
            String endpointUrl;
            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.APPLICATION_JSON);

            if (apiKey != null && !apiKey.isBlank()) {
                // Developer API / Direct key mode
                endpointUrl = String.format(
                        "https://generativelanguage.googleapis.com/v1beta/models/%s:generateContent?key=%s",
                        model, apiKey.trim()
                );
            } else {
                // Vertex AI enterprise mode using Google Cloud IAM (ADC)
                endpointUrl = String.format(
                        "https://%s-aiplatform.googleapis.com/v1/projects/%s/locations/%s/publishers/google/models/%s:generateContent",
                        location, projectId, location, model
                );
                String token = getOAuth2Token();
                if (token == null || token.isBlank()) {
                    log.warn("⚠️ No GCP OAuth2 token available for Vertex AI");
                    return buildFallbackResponse("GCP credentials not found for Vertex AI");
                }
                headers.setBearerAuth(token);
            }

            // Build request payload matching Vertex AI / Gemini schema
            ObjectNode requestBody = objectMapper.createObjectNode();

            // contents: [{ role: "user", parts: [{ text: prompt }] }]
            ArrayNode contentsArray = requestBody.putArray("contents");
            ObjectNode userContent = contentsArray.addObject();
            userContent.put("role", "user");
            ArrayNode partsArray = userContent.putArray("parts");
            partsArray.addObject().put("text", prompt);

            // systemInstruction
            ObjectNode systemInstruction = requestBody.putObject("systemInstruction");
            ArrayNode sysParts = systemInstruction.putArray("parts");
            sysParts.addObject().put("text", getSystemPrompt());

            // generationConfig: enforce pure JSON
            ObjectNode genConfig = requestBody.putObject("generationConfig");
            genConfig.put("temperature", 0.2);
            genConfig.put("responseMimeType", "application/json");

            HttpEntity<String> entity = new HttpEntity<>(objectMapper.writeValueAsString(requestBody), headers);
            ResponseEntity<String> response;
            try {
                response = restTemplate.exchange(endpointUrl, HttpMethod.POST, entity, String.class);
            } catch (org.springframework.web.client.HttpClientErrorException.NotFound notFoundEx) {
                if (!endpointUrl.contains("us-central1") || !endpointUrl.contains("gemini-1.5-flash")) {
                    log.warn("⚠️ Model/region endpoint {} not found, falling back to us-central1 gemini-1.5-flash", endpointUrl);
                    String fallbackUrl = String.format(
                            "https://us-central1-aiplatform.googleapis.com/v1/projects/%s/locations/us-central1/publishers/google/models/gemini-1.5-flash:generateContent",
                            projectId
                    );
                    response = restTemplate.exchange(fallbackUrl, HttpMethod.POST, entity, String.class);
                } else {
                    throw notFoundEx;
                }
            } catch (org.springframework.web.client.HttpStatusCodeException httpEx) {
                log.error("❌ Vertex AI HTTP error: status={} body={}", httpEx.getStatusCode(), httpEx.getResponseBodyAsString());
                throw httpEx;
            }

            if (response.getStatusCode().is2xxSuccessful() && response.getBody() != null) {
                return parseGeminiResponse(response.getBody());
            } else {
                log.warn("Vertex AI returned non-2xx status: {}", response.getStatusCode());
                return buildFallbackResponse("Vertex AI HTTP status: " + response.getStatusCode());
            }

        } catch (Exception e) {
            log.error("❌ Vertex AI call failed: {}", e.getMessage(), e);
            return buildFallbackResponse("Vertex AI invocation error: " + e.getMessage());
        }
    }

    @Override
    public String getProviderName() {
        return "Google Cloud Vertex AI (" + model + ")";
    }

    @Override
    public boolean isAvailable() {
        if (apiKey != null && !apiKey.isBlank()) {
            return true;
        }
        try {
            GoogleCredentials credentials = GoogleCredentials.getApplicationDefault();
            return credentials != null;
        } catch (Exception e) {
            return false;
        }
    }

    private String getOAuth2Token() {
        try {
            GoogleCredentials credentials = GoogleCredentials.getApplicationDefault()
                    .createScoped(Collections.singletonList("https://www.googleapis.com/auth/cloud-platform"));
            credentials.refreshIfExpired();
            AccessToken token = credentials.getAccessToken();
            return token != null ? token.getTokenValue() : null;
        } catch (Exception e) {
            log.debug("ADC lookup failed: {}", e.getMessage());
            return null;
        }
    }

    private String getSystemPrompt() {
        return """
                You are an expert Principal Site Reliability Engineer (SRE) and Autonomous Incident Triage Agent.
                Analyze the provided telemetry metrics and runtime log events to perform deep Root Cause Analysis.
                
                You must return a valid JSON object with the following fields:
                {
                  "rootCause": "Short category like DB_OUTAGE, MEMORY_LEAK, DOWNSTREAM_FAILURE, DEPLOYMENT_ISSUE, TRAFFIC_SPIKE, CONFIGURATION_ERROR, NETWORK_ISSUE",
                  "title": "Short incident title for the dashboard (max 80 chars)",
                  "rcaSummary": "2-3 sentence plain English summary of what happened and why based on the logs",
                  "rootCauseDetail": "Detailed technical explanation with evidence from the logs",
                  "impactAnalysis": "Which users and services are affected, and how severely",
                  "suggestedFix": "Step by step fix for the on-call engineer based on these logs",
                  "prevention": "How to prevent this from happening again",
                  "confidence": 0.95
                }
                
                Respond ONLY with the JSON object.
                """;
    }

    private RCAResponse parseGeminiResponse(String responseBody) {
        try {
            JsonNode root = objectMapper.readTree(responseBody);
            JsonNode candidates = root.path("candidates");
            if (!candidates.isArray() || candidates.isEmpty()) {
                log.warn("Gemini response contains no candidates: {}", responseBody);
                return buildFallbackResponse("No candidates returned by Gemini");
            }

            JsonNode firstCandidate = candidates.get(0);
            JsonNode parts = firstCandidate.path("content").path("parts");
            if (!parts.isArray() || parts.isEmpty()) {
                return buildFallbackResponse("No text parts in Gemini candidate");
            }

            String jsonText = parts.get(0).path("text").asText();
            String cleanJson = extractJsonObject(jsonText);
            if (cleanJson == null || cleanJson.isBlank()) {
                return buildFallbackResponse("No valid JSON object found in Gemini text");
            }

            JsonNode rcaJson = objectMapper.readTree(cleanJson);

            String rootCause = getField(rcaJson, "rootCause", "root_cause", "cause");
            String rcaSummary = getField(rcaJson, "rcaSummary", "rca_summary", "summary");
            String impactAnalysis = getField(rcaJson, "impactAnalysis", "impact_analysis", "impact");
            String suggestedFix = getField(rcaJson, "suggestedFix", "suggested_fix", "fix", "mitigation");
            String prevention = getField(rcaJson, "prevention", "prevention_steps", "preventive_measures");
            String title = getField(rcaJson, "title", "incident_title");

            if (rootCause == null || rootCause.isBlank()) rootCause = "SYSTEM_ANOMALY";
            if (title == null || title.isBlank()) title = rootCause + " Incident detected";
            if (rcaSummary == null || rcaSummary.isBlank()) rcaSummary = "Anomaly detected and investigated.";
            if (suggestedFix == null || suggestedFix.isBlank()) suggestedFix = "Inspect service logs and verify system metrics.";
            if (impactAnalysis == null || impactAnalysis.isBlank()) impactAnalysis = "Affected service experiencing degraded performance.";
            if (prevention == null || prevention.isBlank()) prevention = "Monitor service threshold alerts and resource limits.";

            double confidence = 0.95;
            if (rcaJson.has("confidence") && rcaJson.get("confidence").isNumber()) {
                confidence = Math.max(0.60, Math.min(0.99, rcaJson.get("confidence").asDouble()));
            }

            return RCAResponse.builder()
                    .rootCause(rootCause.toUpperCase().trim())
                    .title(title)
                    .rcaSummary(rcaSummary)
                    .rootCauseDetail(getField(rcaJson, "rootCauseDetail", "root_cause_detail", "detail"))
                    .impactAnalysis(impactAnalysis)
                    .suggestedFix(suggestedFix)
                    .prevention(prevention)
                    .confidence(confidence)
                    .parseSuccess(true)
                    .build();

        } catch (Exception e) {
            log.error("Failed to parse Gemini response: {}", e.getMessage(), e);
            return buildFallbackResponse("Failed to parse Gemini response: " + e.getMessage());
        }
    }

    private String getField(JsonNode node, String... fieldNames) {
        for (String name : fieldNames) {
            if (node.hasNonNull(name) && !node.path(name).asText().isBlank() && !"null".equalsIgnoreCase(node.path(name).asText())) {
                return node.path(name).asText();
            }
        }
        return null;
    }

    private String extractJsonObject(String text) {
        if (text == null) return null;
        int firstBrace = text.indexOf('{');
        int lastBrace = text.lastIndexOf('}');
        if (firstBrace != -1 && lastBrace > firstBrace) {
            return text.substring(firstBrace, lastBrace + 1);
        }
        return null;
    }

    private RCAResponse buildFallbackResponse(String reason) {
        return RCAResponse.builder()
                .rootCause("UNKNOWN")
                .title("RCA generation failed — manual investigation required")
                .rcaSummary("Automated RCA via Vertex AI could not be generated: " + reason)
                .rootCauseDetail("Please investigate manually using the related logs.")
                .impactAnalysis("Unknown — manual assessment required.")
                .suggestedFix("Review logs manually and verify Vertex AI credentials.")
                .prevention("Verify GCP IAM Vertex AI User role is assigned to the VM service account.")
                .confidence(0.0)
                .parseSuccess(false)
                .build();
    }
}
