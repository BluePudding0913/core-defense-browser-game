package example;

/** Server-clock aim and movement penalties. No transport, rendering or session dependencies. */
final class AimControlRules {
    static final double PERIOD=SniperRules.PERIOD, MOVE_RECOVERY=.25, TURN_RECOVERY=.22, TURN_WEIGHT=1.5, PRONE_TURN_WEIGHT=3;
    private AimControlRules() {}
    static boolean supported(String weapon) {
        return switch(weapon) {
            case "pistol","smg","rifle","revolver","lmg","shotgun","ricochet","freezeGun","sniper" -> true;
            default -> false;
        };
    }
    static final class State {
        double elapsed,movement,speedRatio,turn,lastLookTime;
        double dx,dy=-1,pitch;
        boolean hasLook,airborne;
        Double inputTime;
        State copy() {
            var s=new State();s.elapsed=elapsed;s.movement=movement;s.speedRatio=speedRatio;s.turn=turn;s.lastLookTime=lastLookTime;
            s.dx=dx;s.dy=dy;s.pitch=pitch;s.hasLook=hasLook;s.airborne=airborne;s.inputTime=inputTime;return s;
        }
        void advance(double dt) {
            if(!Double.isFinite(dt)||dt<=0)return;
            elapsed+=dt;movement*=Math.exp(-dt/MOVE_RECOVERY);turn*=Math.exp(-dt/TURN_RECOVERY);
        }
        void motion(double speed,boolean inAir) {
            if(Double.isFinite(speed)){speedRatio=Math.min(1.8,Math.max(0,speed)/JobRules.WALK_SPEED);movement=Math.max(movement,speedRatio);}
            airborne=inAir;
        }
        void look(double x,double y,double elevation) { look(x,y,elevation,false); }
        void look(double x,double y,double elevation,boolean proneSniper) {
            double length=Math.hypot(x,y);
            if(!Double.isFinite(length)||length<1e-6||!FpsHitRules.validPitch(elevation))return;
            x/=length;y/=length;
            if(hasLook) {
                double dot=(dx*x+dy*y)*Math.cos(pitch)*Math.cos(elevation)+Math.sin(pitch)*Math.sin(elevation);
                double angle=Math.acos(Math.max(-1,Math.min(1,dot)));
                double speed=angle/Math.max(.02,elapsed-lastLookTime);
                // Prone sniping tolerates only ~3 degrees/sec and reacts five times faster.
                // Only server time recovers penalties.
                turn=Math.max(turn,Math.min(1.5,Math.max(0,(speed-(proneSniper?.05:.35))/(proneSniper?.5:2.5))));
            }
            dx=x;dy=y;pitch=elevation;hasLook=true;lastLookTime=elapsed;
        }
        boolean validTime(double time) {
            return Double.isFinite(time)&&time>=0&&time>=elapsed-.20-1e-9&&time<=elapsed+.06
                &&(inputTime==null||time>=inputTime-1e-9);
        }
    }
    static double breath(double elapsed) { return 1+.35*Math.sin(elapsed/PERIOD*Math.PI*2); }
    static double penalty(State state) { return penalty(state,false); }
    static double penalty(State state,boolean proneSniper) { return 1+1.25*Math.max(state.movement,state.speedRatio)+(proneSniper?PRONE_TURN_WEIGHT:TURN_WEIGHT)*state.turn+(state.airborne?.8:0); }
    static double radius(State state,String weapon,SniperRules.State sniper) {
        if(!supported(weapon))return ShotSpreadRules.radius(weapon);
        double time=state.inputTime!=null&&state.validTime(state.inputTime)?state.inputTime:state.elapsed;
        double base;
        if(weapon.equals("sniper")&&sniper.fixed) {
            double proneTime=sniper.inputTime!=null&&sniper.validTime(sniper.inputTime)?sniper.inputTime:sniper.elapsed;
            base=SniperRules.radius(sniper,proneTime);
        } else {
            base=ShotSpreadRules.radius(weapon)*breath(time);
            if(weapon.equals("sniper"))base+=48*Math.pow(sniper.recovery/SniperRules.RECOVERY,2);
        }
        return base*penalty(state,weapon.equals("sniper")&&sniper.fixed);
    }
}
