# -*- coding: utf-8 -*-
"""iOS continuous-curvature rounded rect for AE masks (squircle).
Rule (Wenxin 2026-08-20): ALL card rounded corners use this — never single-arc k=0.5523.
Model: superellipse corner, exponent n=3.257, edge extent m=1.528*R
(apex depth matches a circular radius R at 45 deg, extent matches Apple's continuous corners).
Returns (vertices, inTangents, outTangents) for a w*h rect, clockwise, y-down, corner radius R.
"""
import math

def _corner_pts(m, n, samples):
    # superellipse centered (m,m), local corner at origin, edges along +x/+y, t in [0,pi/2]
    pts=[]
    for i in range(samples):
        t=(math.pi/2)*i/(samples-1)
        x=m*(1-math.cos(t)**(2.0/n))
        y=m*(1-math.sin(t)**(2.0/n))
        pts.append((x,y))
    return pts  # from (0,m)... check: t=0 -> (0, m*(1-0))=(0,m)? cos0=1 -> x=0; sin0=0 -> y=m. yes (0,m) to (m,0)

def ios_rrect(w,h,R,n=3.257,ext=1.528,samples=7):
    m=min(ext*R, w/2.0-0.5, h/2.0-0.5)
    cp=_corner_pts(m,n,samples)   # corner-local, from edge-point (0,m) to edge-point (m,0)
    # TL corner region: local origin at (0,0); curve from (0,m) [left edge] to (m,0) [top edge]
    TL=[(x,y) for (x,y) in cp]
    TR=[(w-x,y) for (x,y) in reversed(cp)]         # from (w-m,0) to (w,m)
    BR=[(w-x,h-y) for (x,y) in cp]                 # from (w,h-m) to (w-m,h)
    BL=[(x,h-y) for (x,y) in reversed(cp)]         # from (m,h) to (0,h-m)
    # clockwise order starting at TL curve start? Standard: TL(from left edge up to top), TR, BR, BL
    seq=TL+TR+BR+BL
    V=len(seq)
    vin=[[0.0,0.0] for _ in range(V)]; vout=[[0.0,0.0] for _ in range(V)]
    S=samples
    def smooth(idx_range):
        for k in range(1,len(idx_range)-1):
            i=idx_range[k]; ip=idx_range[k-1]; inx=idx_range[k+1]
            px,py=seq[ip]; cx,cy=seq[i]; nx,ny=seq[inx]
            tx,ty=nx-px,ny-py
            L=math.hypot(tx,ty)
            if L<1e-6: continue
            tx,ty=tx/L,ty/L
            dp=math.hypot(cx-px,cy-py)/3.0
            dn=math.hypot(nx-cx,ny-cy)/3.0
            vin[i]=[-tx*dp,-ty*dp]; vout[i]=[tx*dn,ty*dn]
        # endpoints: tangent along the edge
        i0=idx_range[0]; i1=idx_range[1]
        d0=math.hypot(seq[i1][0]-seq[i0][0],seq[i1][1]-seq[i0][1])/3.0
        iN=idx_range[-1]; iM=idx_range[-2]
        dN=math.hypot(seq[iN][0]-seq[iM][0],seq[iN][1]-seq[iM][1])/3.0
        return d0,dN
    # edge tangent dirs per corner (start-tangent, end-tangent), clockwise
    dirs={0:((0,-1),(1,0)),1:((1,0),(0,1)),2:((0,1),(-1,0)),3:((-1,0),(0,-1))}
    for c in range(4):
        rng=list(range(c*S,(c+1)*S))
        d0,dN=smooth(rng)
        sd,ed=dirs[c]
        vout[rng[0]]=[sd[0]*d0,sd[1]*d0]
        vin[rng[0]]=[0.0,0.0]
        vin[rng[-1]]=[-ed[0]*dN,-ed[1]*dN]
        vout[rng[-1]]=[0.0,0.0]
    return seq,vin,vout

if __name__=="__main__":
    v,i,o=ios_rrect(484,484,39)
    print("verts:",len(v),"first:",v[0],"corner apex-ish:",v[3])
