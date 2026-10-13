package com.pulsestream.query.model;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;

/**
 * One signed-in console session, mapped to {@code platform.operator_sessions}.
 *
 * <p>Only the SHA-256 of the bearer token is kept, so the raw token exists solely in the browser that
 * received it. Deleting the row is what logging out means.
 */
@Entity
@Table(name = "operator_sessions")
public class OperatorSessionEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "token_hash", nullable = false, unique = true, length = 64)
    private String tokenHash;

    @Column(name = "operator_id", nullable = false)
    private Long operatorId;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Column(name = "expires_at", nullable = false)
    private Instant expiresAt;

    protected OperatorSessionEntity() {
    }

    public OperatorSessionEntity(String tokenHash, Long operatorId, Instant createdAt, Instant expiresAt) {
        this.tokenHash = tokenHash;
        this.operatorId = operatorId;
        this.createdAt = createdAt;
        this.expiresAt = expiresAt;
    }

    public boolean isExpiredAt(Instant now) {
        return !expiresAt.isAfter(now);
    }

    public Long getId() {
        return id;
    }

    public String getTokenHash() {
        return tokenHash;
    }

    public Long getOperatorId() {
        return operatorId;
    }

    public Instant getExpiresAt() {
        return expiresAt;
    }
}
