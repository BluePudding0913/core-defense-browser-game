package example;

import java.util.function.DoubleSupplier;

/** Sniper timing and cone sampling; independent of transport, rendering and session state. */
final class SniperRules {
    static final double PERIOD = 2.8, EYE_HEIGHT = 6.2, RECOVERY = .9;
    static final double PIXEL_SLOPE = Math.tan(Math.toRadians(10)) / 425;
    static final double MAX_REWIND = .20, DEPLOY_SECONDS = .8;
    static double stability(double time) { return 1-.65*Math.min(1,Math.max(0,time)/180); }
    private SniperRules() {}

    static final class State {
        boolean fixed, deploying, precision, nextPrecision, previousPrecision;
        double deployTime;
        int cycle;
        double elapsed, recovery, facingX, facingY = -1, pitch;
        Double inputTime;
        State copy() {
            var s = new State(); s.fixed=fixed; s.deploying=deploying; s.deployTime=deployTime; s.precision=precision; s.nextPrecision=nextPrecision;
            s.previousPrecision=previousPrecision; s.cycle=cycle; s.elapsed=elapsed; s.recovery=recovery;
            s.facingX=facingX; s.facingY=facingY; s.pitch=pitch; s.inputTime=inputTime; return s;
        }
        void start(DoubleSupplier random) {
            fixed=true; deploying=false; deployTime=0; elapsed=0; cycle=0; inputTime=null; previousPrecision=false;
            precision=random.getAsDouble()<.2; nextPrecision=random.getAsDouble()<.2;
        }
        void cancelDeploy() { deploying=false; deployTime=0; }
        void stop() { cancelDeploy(); fixed=false; elapsed=0; cycle=0; inputTime=null; precision=nextPrecision=previousPrecision=false; }
        void advance(double dt, DoubleSupplier random) {
            recovery=Math.max(0,recovery-dt);
            if (!fixed) return;
            elapsed+=dt;
            while (elapsed >= (cycle+1)*PERIOD) {
                previousPrecision=precision; precision=nextPrecision; nextPrecision=random.getAsDouble()<.2; cycle++;
            }
        }
        boolean validTime(double value) {
            return fixed && Double.isFinite(value) && value>=0 && value>=elapsed-MAX_REWIND-1e-9
                    && value<=elapsed+.06 && (inputTime==null || value>=inputTime-1e-9);
        }
    }

    static boolean eligible(Player p) {
        return !p.down && !p.movingCore && p.weapon.equals("sniper") && p.selectedBuild==null
                && !p.missileControl && !DroneRules.controlling(p) && !DroneRules.mounted(p,"sniper")
                && p.scoutDashRemaining<=0 && Math.abs(p.jumpVelocity)<1e-9 && !JobRules.attackBlocked(p);
    }

    static double radius(State state, double time) {
        if (!state.fixed) return 90 + 48*Math.pow(state.recovery/RECOVERY,2);
        time=Math.max(0,Math.min(time,state.elapsed+.06));
        int index=(int)Math.floor(time/PERIOD);
        boolean special=index<state.cycle?state.previousPrecision:index>state.cycle?state.nextPrecision:state.precision;
        boolean warning=index<state.cycle?state.precision:index==state.cycle && state.nextPrecision;
        double wave=Math.sin((time%PERIOD)/PERIOD*Math.PI*2),baseline=38;
        double breath=baseline+21*wave-wave*wave
                -(special && wave<0?12.5*wave*wave:0)+(warning && wave>0?3.48*wave*wave:0);
        return breath*stability(time)
                +70*Math.pow(Math.max(0,1-time/.7),2)+48*Math.pow(state.recovery/RECOVERY,2);
    }

    record Direction(double dx, double dy, double pitch) {}
    // A uniform disk in the plane perpendicular to the sight line, not uniform radius.
    static Direction scatter(double dx, double dy, double pitch, double radius, DoubleSupplier random) {
        double r=Math.sqrt(random.getAsDouble())*radius*PIXEL_SLOPE,angle=random.getAsDouble()*Math.PI*2;
        double horizontal=r*Math.cos(angle),vertical=r*Math.sin(angle),c=Math.cos(pitch),s=Math.sin(pitch);
        double x=dx*c-dy*horizontal-dx*s*vertical;
        double y=dy*c+dx*horizontal-dy*s*vertical;
        double h=s+c*vertical,length=Math.hypot(x,y);
        return new Direction(x/length,y/length,Math.atan2(h,length));
    }
}
