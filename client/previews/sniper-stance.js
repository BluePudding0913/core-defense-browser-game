"use strict";
window.buildSniperStance=T=>{
    const soldier=window.buildSoldier(T);soldier.setWeapon('sniper');
    window.applySniperStance(T,soldier);
    soldier.root.name='SniperPronePrototype';soldier.root.updateMatrixWorld(true);
    return soldier;
};
