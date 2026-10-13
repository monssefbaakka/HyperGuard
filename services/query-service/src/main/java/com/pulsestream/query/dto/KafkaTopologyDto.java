package com.pulsestream.query.dto;

import java.util.List;

/**
 * The broker's own view of the streaming tier, as reported by Kafka's AdminClient.
 *
 * <p>When the cluster cannot be reached {@code available} is false and {@code error} carries the
 * reason, so the console can say so rather than render figures it does not have.
 *
 * @param available      whether the cluster answered
 * @param error          failure detail when it did not
 * @param clusterId      broker-reported cluster id
 * @param brokerCount    number of live brokers
 * @param primaryGroup   consumer group the per-partition offsets belong to
 * @param topics         described topics, prefix-filtered
 * @param consumerGroups every consumer group known to the cluster
 */
public record KafkaTopologyDto(
        boolean available,
        String error,
        String clusterId,
        int brokerCount,
        String primaryGroup,
        List<TopicDto> topics,
        List<ConsumerGroupDto> consumerGroups) {

    /**
     * @param name              topic name
     * @param partitionCount    number of partitions
     * @param replicationFactor replicas configured for its first partition
     * @param fullyReplicated   true when every partition has all replicas in sync
     * @param partitions        per-partition detail
     */
    public record TopicDto(
            String name,
            int partitionCount,
            int replicationFactor,
            boolean fullyReplicated,
            List<PartitionDto> partitions) {
    }

    /**
     * @param partition       partition number
     * @param leader          broker currently leading it
     * @param replicaCount    replicas assigned
     * @param inSyncCount     replicas currently in sync
     * @param endOffset       offset of the next record to be written
     * @param committedOffset offset the primary group has committed, null when it never has
     * @param lag             endOffset - committedOffset, null when there is no commit
     */
    public record PartitionDto(
            int partition,
            String leader,
            int replicaCount,
            int inSyncCount,
            long endOffset,
            Long committedOffset,
            Long lag) {
    }

    /**
     * @param groupId     group name
     * @param state       broker-reported state, e.g. STABLE or EMPTY
     * @param memberCount consumers currently joined
     */
    public record ConsumerGroupDto(String groupId, String state, int memberCount) {
    }
}
