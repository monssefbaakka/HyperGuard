package com.pulsestream.query.controller;

import com.pulsestream.query.dto.IncidentDtos.IncidentDetailDto;
import com.pulsestream.query.dto.IncidentDtos.IncidentDto;
import com.pulsestream.query.dto.IncidentDtos.ResolveRequest;
import com.pulsestream.query.dto.PageResponseDto;
import com.pulsestream.query.model.OperatorEntity;
import com.pulsestream.query.security.ApiAuthenticationInterceptor;
import com.pulsestream.query.service.IncidentService;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestAttribute;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * Incidents correlated from anomalies, and their triage by signed-in operators.
 */
@RestController
@RequestMapping("/api/v1/incidents")
public class IncidentController {

    private final IncidentService incidentService;

    public IncidentController(IncidentService incidentService) {
        this.incidentService = incidentService;
    }

    /** @param status {@code OPEN}, {@code ACKNOWLEDGED}, {@code RESOLVED}, or {@code ACTIVE} for the first two */
    @GetMapping
    public PageResponseDto<IncidentDto> search(
            @RequestParam(required = false) String tenantId,
            @RequestParam(required = false) String deviceId,
            @RequestParam(required = false) String status,
            @RequestParam(required = false) String severity,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "50") int size) {
        return incidentService.search(tenantId, deviceId, status, severity, page, size);
    }

    @GetMapping("/{id}")
    public IncidentDetailDto get(@PathVariable long id) {
        return incidentService.get(id);
    }

    @PostMapping("/{id}/acknowledge")
    public IncidentDto acknowledge(
            @PathVariable long id,
            @RequestAttribute(ApiAuthenticationInterceptor.OPERATOR_ATTRIBUTE) OperatorEntity operator) {
        return incidentService.acknowledge(id, operator);
    }

    @PostMapping("/{id}/resolve")
    public IncidentDto resolve(
            @PathVariable long id,
            @RequestAttribute(ApiAuthenticationInterceptor.OPERATOR_ATTRIBUTE) OperatorEntity operator,
            @Valid @RequestBody ResolveRequest request) {
        return incidentService.resolve(id, request.note(), operator);
    }
}
