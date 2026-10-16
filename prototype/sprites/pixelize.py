#!/usr/bin/env python3
"""이미지 모델이 뽑은 '픽셀처럼 보이는' 그림을 진짜 픽셀 스프라이트로 정리한다.

사용법:
  python3 pixelize.py tank_raw.png tank.png --size 64x96 --colors 4
  python3 pixelize.py tank_raw.png tank_dead.png --size 64x96 --colors 4 --darken 0.5

하는 일:
  1. 바깥 검정 여백을 잘라낸다 (--no-trim 으로 끔)
  2. 가까운 픽셀 샘플링(NEAREST)으로 축소해 흐림을 없앤다
  3. 색을 --colors 개로 제한한다 (디더링 없음)
  4. 순수 검정에 가까운 픽셀을 투명으로 바꾼다 (--keep-black 으로 끔)
  5. 3배 확대 미리보기 <out>_x3.png 를 함께 저장한다
"""
import argparse
from PIL import Image, ImageChops, ImageEnhance

ap = argparse.ArgumentParser()
ap.add_argument("src"); ap.add_argument("out")
ap.add_argument("--size", default="64x96", help="가로x세로. 비율은 유지하고 이 안에 맞춘다")
ap.add_argument("--colors", type=int, default=4)
ap.add_argument("--darken", type=float, default=1.0, help="밝기 배율. 0.5면 사망 상태용")
ap.add_argument("--no-trim", action="store_true")
ap.add_argument("--keep-black", action="store_true")
ap.add_argument("--black-threshold", type=int, default=28)
ap.add_argument("--fixed", action="store_true", help="고정 4색 팔레트(검정/어둠/중간/밝음)로 밝기 기준 매핑. 상태별 변형의 색을 일정하게 유지할 때 사용")
ap.add_argument("--cuts", default="40,110,175", help="--fixed 일 때 밝기 경계 3개")
a = ap.parse_args()

im = Image.open(a.src).convert("RGB")

# 1. 검정 여백 트림
if not a.no_trim:
    bg = Image.new("RGB", im.size, (0, 0, 0))
    diff = ImageChops.difference(im, bg).convert("L").point(lambda v: 255 if v > a.black_threshold else 0)
    box = diff.getbbox()
    if box:
        pad = int(min(im.size) * 0.02)
        box = (max(0, box[0] - pad), max(0, box[1] - pad), min(im.width, box[2] + pad), min(im.height, box[3] + pad))
        im = im.crop(box)

# 2. 축소 (비율 유지)
W, H = map(int, a.size.lower().split("x"))
scale = min(W / im.width, H / im.height)
tw, th = max(1, round(im.width * scale)), max(1, round(im.height * scale))
# 먼저 BOX로 2배 크기까지 줄여 노이즈를 눌러주고, 마지막은 NEAREST로 끊는다
im = im.resize((tw * 2, th * 2), Image.BOX).resize((tw, th), Image.NEAREST)

# 3. 색 제한
if a.darken != 1.0:
    im = ImageEnhance.Brightness(im).enhance(a.darken)
if a.fixed:
    # 시안의 팔레트: 검정, 어두운 액체, 중간 톤, 뼈색
    PAL = [(10, 10, 9), (46, 40, 39), (132, 117, 113), (214, 194, 187)]
    c1, c2, c3 = map(int, a.cuts.split(","))
    L = im.convert("L")
    q = Image.new("RGB", im.size); qp = q.load(); lp0 = L.load()
    for y in range(im.height):
        for x in range(im.width):
            v = lp0[x, y]
            qp[x, y] = PAL[0] if v < c1 else PAL[1] if v < c2 else PAL[2] if v < c3 else PAL[3]
else:
    q = im.quantize(colors=a.colors, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE).convert("RGB")

# 4. 검정 → 투명
out = Image.new("RGBA", (W, H), (0, 0, 0, 0))
px = q.load()
layer = Image.new("RGBA", q.size)
lp = layer.load()
for y in range(q.height):
    for x in range(q.width):
        r, g, b = px[x, y]
        if not a.keep_black and max(r, g, b) <= a.black_threshold:
            lp[x, y] = (0, 0, 0, 0)
        else:
            lp[x, y] = (r, g, b, 255)
out.paste(layer, ((W - tw) // 2, (H - th) // 2))
out.save(a.out)

# 5. 미리보기
prev = out.resize((W * 3, H * 3), Image.NEAREST)
bgp = Image.new("RGBA", prev.size, (18, 20, 23, 255)); bgp.alpha_composite(prev)
pv = a.out.rsplit(".", 1)[0] + "_x3.png"
bgp.save(pv)
pal = sorted({px[x, y] for y in range(q.height) for x in range(q.width)})
print(f"saved {a.out} ({W}x{H}, sprite {tw}x{th}) and {pv}")
print("palette:", pal)
