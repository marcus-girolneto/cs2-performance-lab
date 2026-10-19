package dev.girolneto.cslab;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.net.URI;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

@Service
public class CommunityReputationService {
    public record ReportRequest(String category, String evidenceUrl) {}
    public record Report(String targetId, String reporterId, String category, String evidenceUrl, Instant submittedAt) {}
    public record Summary(int unverifiedReports, Instant fetchedAt) {}

    private final Path file;
    private final ObjectMapper json;
    private final List<Report> reports = new ArrayList<>();

    public CommunityReputationService(ObjectMapper json, @Value("${app.community-directory:./.community-data}") String directory) {
        this.json = json;
        this.file = Path.of(directory).toAbsolutePath().normalize().resolve("reports.json");
        try {
            Files.createDirectories(file.getParent());
            if (Files.isRegularFile(file)) reports.addAll(json.readValue(file.toFile(), new TypeReference<List<Report>>() {}));
        } catch (Exception ex) {
            throw new IllegalStateException("Could not load community reputation data", ex);
        }
    }

    public synchronized Summary summary(String targetId) {
        int count = (int) reports.stream().filter(report -> report.targetId().equals(targetId)).count();
        return new Summary(count, Instant.now());
    }

    public synchronized Summary submit(String targetId, String reporterId, ReportRequest request) {
        if (!targetId.matches("7656119[0-9]{10}") || !reporterId.matches("7656119[0-9]{10}")) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST);
        }
        if (targetId.equals(reporterId)) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "You cannot report your own account");
        if (!List.of("aimbot", "wallhack", "other").contains(request.category())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Choose a supported report category");
        }
        if (request.evidenceUrl() == null || request.evidenceUrl().length() > 500) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Provide a public evidence link up to 500 characters");
        }
        try {
            URI evidence = URI.create(request.evidenceUrl().strip());
            if (!List.of("http", "https").contains(evidence.getScheme()) || evidence.getHost() == null) throw new IllegalArgumentException();
        } catch (Exception ex) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Evidence must be an HTTP or HTTPS link");
        }
        if (reports.stream().anyMatch(report -> report.targetId().equals(targetId) && report.reporterId().equals(reporterId))) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "You already submitted a report for this player");
        }
        reports.add(new Report(targetId, reporterId, request.category(), request.evidenceUrl().strip(), Instant.now()));
        persist();
        return summary(targetId);
    }

    private void persist() {
        Path temp = file.resolveSibling("reports.json.tmp");
        try {
            json.writeValue(temp.toFile(), reports);
            try {
                Files.move(temp, file, StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE);
            } catch (java.nio.file.AtomicMoveNotSupportedException ex) {
                Files.move(temp, file, StandardCopyOption.REPLACE_EXISTING);
            }
        } catch (Exception ex) {
            reports.remove(reports.size() - 1);
            try { Files.deleteIfExists(temp); } catch (Exception ignored) {}
            throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "Could not save report");
        }
    }
}
