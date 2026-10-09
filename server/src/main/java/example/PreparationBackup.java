package example;

import java.util.*;

/** Room-owned preparation checkpoint, independent of sockets and live players. */
record PreparationBackup(World world, List<Player> players, List<TrapSlot> slots,
 List<ResourceNode> resources, List<MaterialFactory> factories, List<DroppedResource> drops,
 List<PoisonGasRules.Cloud> clouds, List<Decoy> decoys, List<MissileStrike> missiles,
 Set<String> unlocked, Set<String> tripped, List<String> spawns, List<String> lanes,
 Random random, String ownerId) {
    record World(
        int roundEnemyTotal, int round, int queuedEnemies, int queuedTinyEnemies,
        int queuedBlueEnemies, int queuedBosses, int coreDefenseLevel, int coreRegenLevel,
        int blackoutBreakerTotal, int nextPrepBonusSeconds, int nextEnemyId, int nextDefenseId,
        int nextDroppedResourceId, int nextFactoryId, int nextSpawnIndex, double elapsedSeconds,
        double victoryMoveRemaining, double teamBuffRemaining, double prepTime, double coreHp,
        double coreMaxHp, double coreX, double coreY, double coreShield,
        double coreMaxShield, double spawnTimer, boolean explosionBossSpawned, boolean wardenSpawned,
        boolean debugMode, boolean blackoutActive, String roundEvent, String failedSpawnId) { }
}
