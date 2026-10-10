package example;

import java.util.List;

/** Wave budgets and weighted introductions, without session or protocol state. */
final class EnemyWaveRules {
    record Entry(String type, int firstRound, double weight) {}
    static final List<Entry> SPECIALS = List.of(
        new Entry("gilded",6,3), new Entry("shield",7,9), new Entry("armored",10,12),
        new Entry("coreHunter",10,6), new Entry("seeker",10,6), new Entry("artillery",12,5), new Entry("blackout",14,2),
        new Entry("bomber",15,8), new Entry("hunter",18,10), new Entry("ghost",18,10),
        new Entry("carrier",22,2), new Entry("siege",26,8), new Entry("champion",34,7));
    static int regularCount(int round) {
        int count = 6 + round * 3 - relief(round);
        if (round >= 40) count = (int)Math.round(count * (1.4 + (round - 40) * .08));
        count = (int)Math.round(count * .8);
        if (round >= 10 && round <= 24) count = (int)Math.ceil(count * (1 + (round <= 20 ? .1 : (25 - round) * .02)));
        return count;
    }
    static boolean explosionRound(int round) { return round >= 25 && (round - 25) % 10 == 0; }
    static int bossCount(int round) { return explosionRound(round) || round % 4 == 0 ? 1 : 0; }
    static int relief(int round) {
        int opening = switch(round) { case 1 -> 3; case 2 -> 4; case 3 -> 5; case 4,5 -> 6; case 6 -> 5;
            default -> Math.max(0, Math.min(4, 11-round)); };
        return Math.max(opening, (int)Math.round((6 + round*3)*.15*reliefScale(round)));
    }
    static double reliefScale(int round) { return round <= 25 ? 1 : Math.max(0,(35-round)/10.0); }
    static double weight(Entry entry, int round, boolean blackoutAllowed, boolean carrierAllowed) {
        if (round < entry.firstRound() || entry.type().equals("blackout") && !blackoutAllowed
                || entry.type().equals("carrier") && !carrierAllowed) return 0;
        if (entry.type().equals("shield")) return round == 7 ? 3.4 : round == 8 ? 6.1 : 9;
        return entry.type().equals("artillery") && round >= 26 ? 8 : entry.weight();
    }
    static String select(int round, String bias, double roll, boolean blackoutAllowed, boolean carrierAllowed) {
        double runner = round >= 3 ? (bias.equals("runner") ? 56 : bias.equals("brute") ? 16 : 24) : 0;
        double brute = round >= 5 ? (bias.equals("brute") ? 38 : bias.equals("runner") ? 10 : 14) : 0;
        double total = 40 + runner + brute;
        for (Entry entry : SPECIALS) total += weight(entry,round,blackoutAllowed,carrierAllowed);
        double pick = Math.min(Math.nextDown(total), Math.max(0,roll)*total);
        if ((pick -= 40) < 0) return "grunt";
        if ((pick -= runner) < 0) return "runner";
        if ((pick -= brute) < 0) return "brute";
        for (Entry entry : SPECIALS) if ((pick -= weight(entry,round,blackoutAllowed,carrierAllowed)) < 0) return entry.type();
        return "grunt";
    }
    private EnemyWaveRules() {}
}
