# Security policy

The Java server owns movement, collision, health, damage, weapon ownership, ammunition, resources, purchases, construction, unlocks, revives and round progression. The browser submits intentions and predicts movement for display only; its local checks cannot authorize gameplay changes. CPUs use the same validated gameplay actions as humans.

## Input and concurrency checks

- MOVE and FIRE reject non-finite coordinates; movement is normalized and applied only by the fixed server tick. Aim coordinates are bounded to the world.
- Damage, fire cooldowns, prices, item counts and facility distance/area access are checked by the server. READY is restricted to the room owner.
- Each connection accepts a burst of 180 messages and replenishes 120 per second. Message sizes and input sequences are bounded/checked; replaced reconnect sockets cannot continue controlling a player.
- SnapshotBuilder reads simulation state under gameLock, including the first onOpen snapshot. Room directory serialization uses the same lock.
- Build requests use common placement validation, including legacy slot commands. Invalid coordinates are rejected before tile conversion.

## Deployment and limits

Session IDs are random bearer credentials for reconnecting, not authenticated user accounts. Keep them private. Client modifications can still automate aiming or reveal received world state; server authority does not prevent these information/automation cheats.

TLS is available through CORE_TLS_KEYSTORE / CORE_TLS_PASSWORD (optional CORE_TLS_KEYSTORE_TYPE). Configure CORE_ALLOWED_ORIGINS and CORE_ACCESS_TOKEN when sharing access. CORE_MAX_ROOMS limits room allocation. Default settings are for trusted local/private play; public hosting still needs authenticated users, per-IP connection limits, TLS, monitoring and appropriate proxy configuration. A per-connection message limit is not a distributed denial-of-service defense.

Report vulnerabilities privately through the repository's security advisory feature.
