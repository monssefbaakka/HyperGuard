package com.pulsestream.query.model;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

/**
 * An operator's profile photo, mapped to {@code platform.operator_avatars}.
 *
 * <p>Kept apart from {@link OperatorEntity} so that authenticating a request never loads image bytes.
 */
@Entity
@Table(name = "operator_avatars")
public class OperatorAvatarEntity {

    @Id
    @Column(name = "operator_id")
    private Long operatorId;

    @Column(name = "content_type", nullable = false, length = 50)
    private String contentType;

    // Bound as plain bytes into BYTEA; left to its default, Hibernate would pick a BLOB/OID mapping.
    @JdbcTypeCode(SqlTypes.VARBINARY)
    @Column(name = "data", nullable = false, columnDefinition = "bytea")
    private byte[] data;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    protected OperatorAvatarEntity() {
    }

    public OperatorAvatarEntity(Long operatorId, String contentType, byte[] data, Instant updatedAt) {
        this.operatorId = operatorId;
        this.contentType = contentType;
        this.data = data;
        this.updatedAt = updatedAt;
    }

    public void replace(String contentType, byte[] data, Instant updatedAt) {
        this.contentType = contentType;
        this.data = data;
        this.updatedAt = updatedAt;
    }

    public Long getOperatorId() {
        return operatorId;
    }

    public String getContentType() {
        return contentType;
    }

    public byte[] getData() {
        return data;
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }
}
