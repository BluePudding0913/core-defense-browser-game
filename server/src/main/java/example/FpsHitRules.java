package example;

/** Server-owned FPS ray/body geometry. Coordinates and dimensions match the rendered enemy body. */
final class FpsHitRules {
    private FpsHitRules() {}
    record Ray(double x, double y, double height, double dx, double dy, double slope, double range) {
        double heightAt(double distance) { return height + slope * distance; }
    }
    record Hit(double distance, double height, boolean headshot) {}

    static boolean validPitch(double pitch) { return Double.isFinite(pitch) && Math.abs(pitch) <= 1.2; }

    static Hit enemy(Ray ray, double x, double y, double radius, double facingX, double facingY, double width) {
        Hit hit = body(ray, x, y, radius * .8, radius * .9, radius * .8, radius * .8, facingX, facingY, width);
        if (hit == null) return null;
        // The visible upper quarter (eyes and crown) is the head region; bullet width cannot enlarge it.
        return new Hit(hit.distance(), hit.height(), hit.height() >= radius * 1.15 && hit.height() <= radius * 1.6);
    }

    /** GRUNT's lab-worker model has a small head above a separate torso/leg volume.
     * Bullet width is body aim tolerance; it must not enlarge the headshot target.
     * The head includes the jaw and a small allowance for the cosmetic head tilt.
     */
    static Hit zombie(Ray ray, double x, double y, double radius, double facingX, double facingY, double width) {
        double length = Math.hypot(facingX, facingY);
        double fx = length > 1e-9 ? facingX / length : 0;
        double fy = length > 1e-9 ? facingY / length : 1;
        Hit torso = body(ray, x, y, radius * .66, radius * .4, radius * .66, radius * .25,
                fx, fy, width);
        Hit head = body(ray, x + fx * radius * .25, y + fy * radius * .25,
                radius * 1.39, radius * .14, radius * .16, radius * .15, fx, fy, 0);
        if (head != null && (torso == null || head.distance() < torso.distance()))
            return new Hit(head.distance(), head.height(), true);
        return torso;
    }

    static Hit ally(Ray ray, double x, double y, boolean down, double width) {
        return body(ray, x, y, down ? 6 : 16, 12, down ? 6 : 16, 12, 0, 1, width);
    }

    static Hit ally(Ray ray, double x, double y, boolean down, double width, double feetHeight) {
        return body(ray, x, y, feetHeight + (down ? 6 : 16), 12, down ? 6 : 16, 12, 0, 1, width);
    }

    static Hit proneAlly(Ray ray,double x,double y,double width,double feetHeight,double facingX,double facingY) {
        return body(ray,x-facingX*2,y-facingY*2,feetHeight+5,8,5,17,facingX,facingY,width);
    }

    static Hit projectile(Ray ray, double x, double y, double width) {
        return body(ray, x, y, 16, 8, 8, 8, 0, 1, width);
    }

    private static Hit body(Ray ray, double x, double y, double centerHeight,
            double rx, double ry, double rz, double facingX, double facingY, double width) {
        double length = Math.hypot(facingX, facingY);
        double sin = length > 1e-9 ? facingX / length : 0, cos = length > 1e-9 ? facingY / length : 1;
        double ox = ray.x() - x, oz = ray.y() - y;
        double px = (ox * cos - oz * sin) / (rx + width);
        double py = (ray.height() - centerHeight) / (ry + width);
        double pz = (ox * sin + oz * cos) / (rz + width);
        double vx = (ray.dx() * cos - ray.dy() * sin) / (rx + width);
        double vy = ray.slope() / (ry + width);
        double vz = (ray.dx() * sin + ray.dy() * cos) / (rz + width);
        double a = vx * vx + vy * vy + vz * vz;
        double b = 2 * (px * vx + py * vy + pz * vz), c = px * px + py * py + pz * pz - 1;
        double discriminant = b * b - 4 * a * c;
        if (a <= 0 || discriminant < 0) return null;
        double entry = Math.max(0, (-b - Math.sqrt(discriminant)) / (2 * a));
        double exit = (-b + Math.sqrt(discriminant)) / (2 * a);
        if (exit < 0 || entry > ray.range() || !Double.isFinite(entry)) return null;
        return new Hit(entry, ray.heightAt(entry), false);
    }
}
