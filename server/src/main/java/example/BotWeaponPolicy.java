package example;

/** CPU weapon choice; navigation and facility use remain in GameSession. */
final class BotWeaponPolicy {
    static void select(Player bot, double targetDistance) {
        if (targetDistance <= 72 && (!hasRangedAmmo(bot) || bot.hp > 70)) {
            bot.equipWeapon("bat");
        } else if (bot.weapons.owns("flamethrower") && bot.weapons.ammo("flamethrower") > 0
                && targetDistance <= WeaponCatalog.stats("flamethrower").range()) {
            bot.equipWeapon("flamethrower");
        } else if (bot.weapons.owns("revolver") && bot.weapons.ammo("revolver") > 0 && targetDistance <= 500) {
            bot.equipWeapon("revolver");
        } else if (bot.weapons.owns("rocket") && bot.weapons.ammo("rocket") > 0 && targetDistance > 160 && targetDistance <= WeaponCatalog.stats("rocket").range()) {
            bot.equipWeapon("rocket");
        } else if (targetDistance > 390 && bot.weapons.owns("sniper") && bot.weapons.ammo("sniper") > 0) {
            bot.equipWeapon("sniper");
        } else if (targetDistance > 260 && bot.weapons.owns("rifle") && bot.weapons.ammo("rifle") > 0) {
            bot.equipWeapon("rifle");
        } else if (bot.weapons.owns("lmg") && bot.weapons.ammo("lmg") > 0 && targetDistance <= 360) {
            bot.equipWeapon("lmg");
        } else if (bot.weapons.owns("ricochet") && bot.weapons.ammo("ricochet") > 0 && targetDistance <= 300) {
            bot.equipWeapon("ricochet");
        } else if (targetDistance > 155 && bot.weapons.owns("smg") && bot.weapons.ammo("smg") > 0) {
            bot.equipWeapon("smg");
        } else if (targetDistance <= 190 && bot.weapons.owns("shotgun") && bot.weapons.ammo("shotgun") > 0) {
            bot.equipWeapon("shotgun");
        } else if (bot.weapons.owns("smg") && bot.weapons.ammo("smg") > 0) {
            bot.equipWeapon("smg");
        } else if (bot.weapons.owns("rifle") && bot.weapons.ammo("rifle") > 0) {
            bot.equipWeapon("rifle");
        } else if (bot.weapons.owns("sniper") && bot.weapons.ammo("sniper") > 0) {
            bot.equipWeapon("sniper");
        } else {
            bot.equipWeapon("pistol");
        }
        bot.selectedBuild = null;
    }

    static boolean hasRangedAmmo(Player bot) {
        return WeaponCatalog.ALL.stream().filter(WeaponCatalog.Definition::usesAmmo)
                .filter(weapon -> weapon.mode() != WeaponCatalog.AttackMode.BEAM)
                .anyMatch(weapon -> bot.weapons.owns(weapon.id()) && bot.weapons.ammo(weapon.id()) > 0);
    }

    private BotWeaponPolicy() { }
}
