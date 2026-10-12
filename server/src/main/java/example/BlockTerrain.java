package example;

import java.util.ArrayList;
import java.util.List;

record BlockRegion(String kind, List<Integer> from, List<Integer> to) {}
record BlockMapDefinition(int blockSize, List<BlockRegion> regions) {}

/** Sparse cuboid terrain. x/z are horizontal, y is height; never expands solid volumes. */
final class BlockTerrain {
    record Box(String kind,double x0,double y0,double z0,double x1,double y1,double z1) {
        boolean contains(double x,double z) {return x>=x0 && x<x1 && z>=z0 && z<z1;}
        double entry(double x,double z,double height,double dx,double dz,double slope,double limit) {
            double lo=0,hi=limit;
            for(int a=0;a<3;a++) {
                double origin=a==0?x:a==1?height:z,direction=a==0?dx:a==1?slope:dz;
                double min=a==0?x0:a==1?y0:z0,max=a==0?x1:a==1?y1:z1;
                if(Math.abs(direction)<1e-12) {if(origin<min || origin>=max)return limit;}
                else {double t0=(min-origin)/direction,t1=(max-origin)/direction;
                    lo=Math.max(lo,Math.min(t0,t1));hi=Math.min(hi,Math.max(t0,t1));if(hi<lo || hi<0)return limit;}
            }
            return lo;
        }
    }
    private final int size,columns,rows;
    private final List<Box>[] buckets;
    @SuppressWarnings("unchecked") BlockTerrain(TileMapDefinition map) {
        size=map.tileSize();columns=map.rows().get(0).length();rows=map.rows().size();
        buckets=(List<Box>[])new List<?>[columns*rows];
        int unit=map.blockMap().blockSize();
        for(BlockRegion region:map.blockMap().regions()) {
            var a=region.from();var b=region.to();var box=new Box(region.kind(),a.get(0)*(double)unit,a.get(1)*(double)unit,a.get(2)*(double)unit,b.get(0)*(double)unit,b.get(1)*(double)unit,b.get(2)*(double)unit);
            for(int r=(int)Math.floor(box.z0/size);r<Math.ceil(box.z1/size);r++)for(int c=(int)Math.floor(box.x0/size);c<Math.ceil(box.x1/size);c++) {
                int index=r*columns+c;if(buckets[index]==null)buckets[index]=new ArrayList<>();buckets[index].add(box);
            }
        }
    }
    List<Box> at(double x,double z) {
        int c=(int)Math.floor(x/size),r=(int)Math.floor(z/size);
        return c<0||r<0||c>=columns||r>=rows||buckets[r*columns+c]==null?List.of():buckets[r*columns+c];
    }
    double ceiling(double x,double z,double feet) {
        double result=Double.POSITIVE_INFINITY;
        for(Box b:at(x,z))if(b.contains(x,z)&&b.y0>feet+1e-6)result=Math.min(result,b.y0);
        return result;
    }
    double support(double x,double z,double feet) {
        double result=Double.NEGATIVE_INFINITY;
        for(Box b:at(x,z))if(b.contains(x,z)&&b.y1<=feet+1e-6)result=Math.max(result,b.y1);
        return result;
    }
    boolean clearBody(double x,double z,double radius,double feet,double height) {
        int minC=Math.max(0,(int)Math.floor((x-radius)/size)),maxC=Math.min(columns-1,(int)Math.floor((x+radius)/size));
        int minR=Math.max(0,(int)Math.floor((z-radius)/size)),maxR=Math.min(rows-1,(int)Math.floor((z+radius)/size));
        for(int r=minR;r<=maxR;r++)for(int c=minC;c<=maxC;c++)if(buckets[r*columns+c]!=null)for(Box b:buckets[r*columns+c]) {
            if(b.y1<=feet+1e-6 || b.y0>=feet+height-1e-6)continue;
            double dx=x-Math.max(b.x0,Math.min(b.x1,x)),dz=z-Math.max(b.z0,Math.min(b.z1,z));
            if(radius==0?b.contains(x,z):dx*dx+dz*dz<radius*radius-1e-9)return false;
        }
        return true;
    }
    double trace(double x,double z,double height,double dx,double dz,double slope,double range) {
        if(!Double.isFinite(range)||range<0)return 0;
        double best=range,t=0;
        // Visit horizontal tile buckets, not each tiny vertical block or every cuboid.
        for(int n=0;n<columns+rows+4 && t<=best;n++) {
            double px=x+dx*(t+1e-7),pz=z+dz*(t+1e-7);
            for(Box b:at(px,pz))best=Math.min(best,b.entry(x,z,height,dx,dz,slope,best));
            if(Math.abs(dx)+Math.abs(dz)<1e-12)break;
            double tx=Math.abs(dx)<1e-12?Double.POSITIVE_INFINITY:(((Math.floor(px/size)+(dx>0?1:0))*size-x)/dx);
            double tz=Math.abs(dz)<1e-12?Double.POSITIVE_INFINITY:(((Math.floor(pz/size)+(dz>0?1:0))*size-z)/dz);
            double next=Math.min(tx,tz);if(next<=t+1e-9)break;t=next;
        }
        return best;
    }
    static void validate(TileMapDefinition map) {
        var blocks=map.blockMap();
        if(blocks==null||blocks.blockSize()<=0||map.tileSize()%blocks.blockSize()!=0||blocks.regions()==null||blocks.regions().isEmpty()||blocks.regions().size()>20000)throw new IllegalStateException("Invalid 3D block map");
        long references=0;int unit=blocks.blockSize();
        for(BlockRegion b:blocks.regions()) {
            if(b==null||b.kind()==null||!List.of("floor","wall","ceiling").contains(b.kind())||b.from()==null||b.to()==null||b.from().size()!=3||b.to().size()!=3||b.from().stream().anyMatch(java.util.Objects::isNull)||b.to().stream().anyMatch(java.util.Objects::isNull))throw new IllegalStateException("Invalid block region");
            for(int a=0;a<3;a++)if(b.from().get(a)>=b.to().get(a))throw new IllegalStateException("Empty block region");
            if(b.from().get(0)<0||b.from().get(2)<0||b.from().get(1)<-128||b.to().get(1)>4096
                    ||b.to().get(0)*(long)unit>map.rows().get(0).length()*(long)map.tileSize()||b.to().get(2)*(long)unit>map.rows().size()*(long)map.tileSize())throw new IllegalStateException("Block outside world");
            references+=(long)Math.ceil((b.to().get(0)*(double)unit)/map.tileSize())-(long)Math.floor((b.from().get(0)*(double)unit)/map.tileSize());
        }
        if(references*map.rows().size()>1000000)throw new IllegalStateException("Block map index budget exceeded");
        var terrain=new BlockTerrain(map);
        for(int r=0;r<map.rows().size();r++)for(int c=0;c<map.rows().get(r).length();c++)if(!map.typeAt(c,r).solid()) {
            double x=(c+.5)*map.tileSize(),z=(r+.5)*map.tileSize();
            if(terrain.support(x,z,0)!=0||!Double.isFinite(terrain.ceiling(x,z,0))||terrain.ceiling(x,z,0)<40)throw new IllegalStateException("Ground floor needs floor and clear ceiling");
        }
    }
}
