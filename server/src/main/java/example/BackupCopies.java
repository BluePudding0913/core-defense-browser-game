package example;

import java.io.*;
import java.util.*;

/** Deep copies for preparation checkpoints. Live connection identity is never copied. */
final class BackupCopies {
    static Defense defense(Defense source) {
        if (source == null) return null;
        var copy = new Defense(source.type, source.maxHp); copy.hp = source.hp; copy.cooldown = source.cooldown; return copy;
    }
    static Drone drone(Drone source) {
        if (source == null) return null;
        var copy = new Drone(); copy.x = source.x; copy.y = source.y; copy.hp = source.hp;
        copy.cooldown = source.cooldown; copy.active = source.active; copy.controlled = source.controlled;
        copy.weapon = source.weapon; copy.attackers.addAll(source.attackers); return copy;
    }
    static List<TrapSlot> slots(List<TrapSlot> source) {
        return source.stream().map(s -> {
            var c = new TrapSlot(s.id, s.lane, s.x, s.y, s.requiredArea);
            c.defense = defense(s.defense); c.ownerId = s.ownerId; c.temporaryRemaining = s.temporaryRemaining; return c;
        }).toList();
    }
    static List<ResourceNode> resources(List<ResourceNode> source) {
        return source.stream().map(s -> {
            var c = new ResourceNode(s.id, s.type, s.x, s.y, s.requiredArea);
            c.available = s.available; c.respawnTimer = s.respawnTimer; return c;
        }).toList();
    }
    static List<MaterialFactory> factories(List<MaterialFactory> source) {
        return source.stream().map(s -> {
            var c = new MaterialFactory(s.id, s.shop, new MapPoint(s.x, s.y)); c.elapsed = s.elapsed; return c;
        }).toList();
    }
    static List<DroppedResource> drops(List<DroppedResource> source) {
        return source.stream().map(s -> {
            var c = new DroppedResource(s.id, s.type, s.x, s.y, s.amount, s.droppedBy);
            c.ownerLeft = s.ownerLeft; c.pickupDelay = s.pickupDelay; return c;
        }).toList();
    }
    static List<PoisonGasRules.Cloud> clouds(List<PoisonGasRules.Cloud> source) {
        return source.stream().map(s -> {
            var c = new PoisonGasRules.Cloud(s.ownerId, s.x, s.y, s.damage); c.remaining = s.remaining; c.tick = s.tick; return c;
        }).toList();
    }
    static List<Decoy> decoys(List<Decoy> source, List<Player> players) {
        return source.stream().map(s -> {
            var owner = players.stream().filter(p -> p.id.equals(s.ownerId)).findFirst().orElseThrow();
            var c = new Decoy(owner, new MapPoint(s.dx, s.dy));
            c.x = s.x; c.y = s.y; c.hp = s.hp; c.remaining = s.remaining; c.travelRemaining = s.travelRemaining; return c;
        }).toList();
    }
    static List<MissileStrike> missiles(List<MissileStrike> source, List<Player> players) {
        return source.stream().map(s -> {
            var owner = players.stream().filter(p -> p.id.equals(s.owner.id)).findFirst().orElseThrow();
            var c = new MissileStrike(owner, s.x, s.y); c.remaining = s.remaining; return c;
        }).toList();
    }
    static Random random(Random source) {
        try {
            var bytes = new ByteArrayOutputStream();
            try (var out = new ObjectOutputStream(bytes)) { out.writeObject(source); }
            try (var in = new ObjectInputStream(new ByteArrayInputStream(bytes.toByteArray()))) { return (Random) in.readObject(); }
        } catch (IOException | ClassNotFoundException error) { throw new IllegalStateException("Cannot copy checkpoint RNG", error); }
    }
    private BackupCopies() { }
}
