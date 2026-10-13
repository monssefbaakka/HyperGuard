package com.pulsestream.query.service;

import com.pulsestream.query.config.TopologyProperties;
import com.pulsestream.query.dto.KafkaTopologyDto;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.TimeUnit;
import java.util.stream.Collectors;
import org.apache.kafka.clients.admin.Admin;
import org.apache.kafka.clients.admin.ConsumerGroupDescription;
import org.apache.kafka.clients.admin.ConsumerGroupListing;
import org.apache.kafka.clients.admin.OffsetSpec;
import org.apache.kafka.clients.admin.TopicDescription;
import org.apache.kafka.clients.consumer.OffsetAndMetadata;
import org.apache.kafka.common.TopicPartition;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

/**
 * Describes the live Kafka cluster for the topology screen.
 *
 * <p>Read-only: it lists topics, describes their partitions and reads consumer-group offsets. It
 * never produces, consumes, creates or deletes. Every figure it returns comes from the broker; when
 * the broker cannot be reached the result says so instead of substituting a plausible number.
 */
@Service
public class KafkaTopologyService {

    private static final Logger log = LoggerFactory.getLogger(KafkaTopologyService.class);

    private final Admin admin;
    private final TopologyProperties properties;

    public KafkaTopologyService(Admin admin, TopologyProperties properties) {
        this.admin = admin;
        this.properties = properties;
    }

    /** The cluster as it is right now, or an unavailable result carrying the reason. */
    public KafkaTopologyDto describe() {
        try {
            return describeCluster();
        } catch (Exception cause) {
            // Interrupts must not be swallowed: restore the flag before reporting.
            if (cause instanceof InterruptedException) {
                Thread.currentThread().interrupt();
            }
            log.warn("Kafka topology unavailable: {}", cause.toString());
            return new KafkaTopologyDto(false, cause.getMessage(), null, 0, properties.primaryGroup(),
                    List.of(), List.of());
        }
    }

    private KafkaTopologyDto describeCluster() throws Exception {
        long timeoutMs = properties.timeout().toMillis();

        String clusterId = admin.describeCluster().clusterId().get(timeoutMs, TimeUnit.MILLISECONDS);
        int brokerCount = admin.describeCluster().nodes().get(timeoutMs, TimeUnit.MILLISECONDS).size();

        List<String> names = admin.listTopics().names().get(timeoutMs, TimeUnit.MILLISECONDS).stream()
                .filter(name -> name.startsWith(properties.topicPrefix()))
                .sorted()
                .toList();

        Map<String, TopicDescription> described =
                admin.describeTopics(names).allTopicNames().get(timeoutMs, TimeUnit.MILLISECONDS);

        Map<TopicPartition, OffsetSpec> latestSpecs = described.values().stream()
                .flatMap(topic -> topic.partitions().stream()
                        .map(partition -> new TopicPartition(topic.name(), partition.partition())))
                .collect(Collectors.toMap(partition -> partition, partition -> OffsetSpec.latest()));

        Map<TopicPartition, Long> endOffsets = latestSpecs.isEmpty()
                ? Map.of()
                : admin.listOffsets(latestSpecs).all().get(timeoutMs, TimeUnit.MILLISECONDS).entrySet().stream()
                        .collect(Collectors.toMap(Map.Entry::getKey, entry -> entry.getValue().offset()));

        Map<TopicPartition, OffsetAndMetadata> committed = admin
                .listConsumerGroupOffsets(properties.primaryGroup())
                .partitionsToOffsetAndMetadata()
                .get(timeoutMs, TimeUnit.MILLISECONDS);

        List<KafkaTopologyDto.TopicDto> topics = new ArrayList<>();
        for (String name : names) {
            TopicDescription description = described.get(name);
            if (description == null) {
                continue;
            }

            List<KafkaTopologyDto.PartitionDto> partitions = description.partitions().stream()
                    .sorted(Comparator.comparingInt(info -> info.partition()))
                    .map(info -> {
                        TopicPartition key = new TopicPartition(name, info.partition());
                        long endOffset = endOffsets.getOrDefault(key, 0L);
                        OffsetAndMetadata commit = committed.get(key);
                        Long committedOffset = commit == null ? null : commit.offset();
                        Long lag = committedOffset == null ? null : Math.max(0, endOffset - committedOffset);
                        return new KafkaTopologyDto.PartitionDto(
                                info.partition(),
                                info.leader() == null ? "none" : info.leader().host() + ":" + info.leader().port(),
                                info.replicas().size(),
                                info.isr().size(),
                                endOffset,
                                committedOffset,
                                lag);
                    })
                    .toList();

            int replicationFactor = partitions.isEmpty() ? 0 : partitions.get(0).replicaCount();
            boolean fullyReplicated = partitions.stream()
                    .allMatch(partition -> partition.inSyncCount() == partition.replicaCount());

            topics.add(new KafkaTopologyDto.TopicDto(
                    name, partitions.size(), replicationFactor, fullyReplicated, partitions));
        }

        List<KafkaTopologyDto.ConsumerGroupDto> groups = describeGroups(timeoutMs);

        return new KafkaTopologyDto(true, null, clusterId, brokerCount, properties.primaryGroup(), topics, groups);
    }

    private List<KafkaTopologyDto.ConsumerGroupDto> describeGroups(long timeoutMs) throws Exception {
        Set<String> groupIds = admin.listConsumerGroups().all().get(timeoutMs, TimeUnit.MILLISECONDS).stream()
                .map(ConsumerGroupListing::groupId)
                .collect(Collectors.toSet());
        if (groupIds.isEmpty()) {
            return List.of();
        }

        Map<String, ConsumerGroupDescription> descriptions =
                admin.describeConsumerGroups(groupIds).all().get(timeoutMs, TimeUnit.MILLISECONDS);

        return descriptions.values().stream()
                .map(description -> new KafkaTopologyDto.ConsumerGroupDto(
                        description.groupId(),
                        description.state().toString(),
                        description.members().size()))
                .sorted(Comparator.comparing(KafkaTopologyDto.ConsumerGroupDto::groupId))
                .toList();
    }
}
