package com.pulsestream.query.controller;

import com.pulsestream.query.dto.IncidentDtos.QuarantineDto;
import com.pulsestream.query.dto.IncidentDtos.QuarantineRequest;
import com.pulsestream.query.model.OperatorEntity;
import com.pulsestream.query.security.ApiAuthenticationInterceptor;
import com.pulsestream.query.service.QuarantineService;
import jakarta.validation.Valid;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestAttribute;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/**
 * Device quarantine. A quarantined device's readings are dropped by telemetry-processor — not stored,
 * not flagged — until an operator releases it.
 */
@RestController
@RequestMapping("/api/v1")
public class QuarantineController {

    private final QuarantineService quarantineService;

    public QuarantineController(QuarantineService quarantineService) {
        this.quarantineService = quarantineService;
    }

    @GetMapping("/quarantine")
    public List<QuarantineDto> list(@RequestParam(required = false) String tenantId) {
        return quarantineService.list(tenantId);
    }

    @PutMapping("/devices/{deviceId}/quarantine")
    @ResponseStatus(HttpStatus.CREATED)
    public QuarantineDto quarantine(
            @PathVariable String deviceId,
            @RequestParam(required = false) String tenantId,
            @RequestAttribute(ApiAuthenticationInterceptor.OPERATOR_ATTRIBUTE) OperatorEntity operator,
            @Valid @RequestBody QuarantineRequest request) {
        return quarantineService.quarantine(tenantId, deviceId, request.reason(), request.incidentId(), operator);
    }

    @DeleteMapping("/devices/{deviceId}/quarantine")
    public QuarantineDto release(
            @PathVariable String deviceId,
            @RequestParam(required = false) String tenantId,
            @RequestAttribute(ApiAuthenticationInterceptor.OPERATOR_ATTRIBUTE) OperatorEntity operator) {
        return quarantineService.release(tenantId, deviceId, operator);
    }
}
