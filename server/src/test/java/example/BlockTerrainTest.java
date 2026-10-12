package example;
import static org.junit.jupiter.api.Assertions.*;
import java.util.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
class BlockTerrainTest {
    BlockRegion box(String kind,int x0,int y0,int z0,int x1,int y1,int z1){return new BlockRegion(kind,List.of(x0,y0,z0),List.of(x1,y1,z1));}
    TileMapDefinition fixture(List<BlockRegion> extra){
        var boxes=new ArrayList<>(List.of(box("floor",0,-2,0,80,0,20),box("ceiling",0,65,0,40,68,20),box("ceiling",40,32,0,80,35,20),box("wall",39,32,0,40,65,20)));boxes.addAll(extra);
        return new TileMapDefinition(40,Map.of(".",new TileType("floor",false,true,"white")),List.of("...."),new BlockMapDefinition(2,boxes));
    }
    @Test void sameFloorTypeCanHaveIndependentHeightsAndRaysHitTransitions(){
        var map=fixture(List.of());BlockTerrain.validate(map);var t=new BlockTerrain(map);
        assertEquals(130,t.ceiling(20,20,0));assertEquals(64,t.ceiling(100,20,0));assertEquals(0,t.support(20,20,0));
        assertEquals(58,t.trace(20,20,26,1,0,1,100),1e-9,"Ray stops at vertical roof transition, not starting ceiling");
        assertEquals(100,t.trace(20,20,26,1,0,0,100),1e-9);assertEquals(26,t.trace(20,20,26,1,0,-1,100),1e-9);
        assertEquals(38,t.trace(100,20,26,1,0,1,60),1e-9);
        assertEquals(104,t.trace(20,20,26,0,0,1,200),1e-9,"Vertical ray");
    }
    @Test void upperFloorsRemainSeparateAtTheSameHorizontalCoordinates(){
        var t=new BlockTerrain(fixture(List.of(box("floor",0,90,0,40,92,20),box("ceiling",0,130,0,40,133,20))));
        assertEquals(0,t.support(20,20,0));assertEquals(130,t.ceiling(20,20,0));
        assertEquals(184,t.support(20,20,184));assertEquals(260,t.ceiling(20,20,184));
        assertFalse(t.clearBody(20,20,5,120,32));assertTrue(t.clearBody(20,20,5,184,32));
        assertEquals(50,t.trace(20,20,210,0,0,1,100),1e-9);
    }
    @Test void timeControlAndTransitHaveUniformExplicitCeilingsAndMapPayloadIncludesBlocks()throws Exception{
        for(int r=23;r<=29;r++)for(int c=29;c<=36;c++)if(!GameMap.TILE_MAP.typeAt(c,r).solid())assertEquals(130,GameMap.ceilingHeight((c+.5)*40,(r+.5)*40),"cell "+c+","+r);
        var data=new ObjectMapper().readTree(GameMap.clientMapMessage()).path("map").path("tileMap").path("blockMap");
        assertEquals(2,data.path("blockSize").asInt());assertTrue(data.path("regions").size()>0);
    }
    @Test void invalidOrUncoveredBlockRegionsAreRejected(){
        assertThrows(IllegalStateException.class,()->BlockTerrain.validate(fixture(List.of(box("wall",0,0,0,81,10,20)))));
        assertThrows(IllegalStateException.class,()->BlockTerrain.validate(fixture(List.of(box("wall",0,0,0,0,10,20)))));
        var map=fixture(List.of());var noRoof=new TileMapDefinition(map.tileSize(),map.legend(),map.rows(),new BlockMapDefinition(2,List.of(box("floor",0,-2,0,80,0,20))));
        assertThrows(IllegalStateException.class,()->BlockTerrain.validate(noRoof));
    }
    @Test void serverTerrainRayStopsAtCeilingsAlongThePath(){
        // Along this path the data changes from a room into a lower passage.
        double d=GameMap.terrainDistance(1020,1660,26,0,-1,1,500);
        assertTrue(d>=0 && d<=104);
    }
}
