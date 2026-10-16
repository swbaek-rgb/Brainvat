"""Create an original stylized brain mesh, editable Blender scene, and GLB.

Run with Blender --background --python scripts/build_brain.py.
All sulci are geometry: the material uses no image or bump textures.
"""
import bpy
import math
from pathlib import Path
from mathutils import Vector, noise

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'prototype/models'
PREVIEWS = OUT / 'brain_previews'
OUT.mkdir(parents=True, exist_ok=True)
PREVIEWS.mkdir(exist_ok=True)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
for block in list(bpy.data.collections):
    if block.name != 'Collection' and block.users == 0:
        bpy.data.collections.remove(block)
asset = bpy.data.collections.get('Collection')
asset.name = 'BRAIN | export geometry'
studio = bpy.data.collections.new('STUDIO | preview only')
bpy.context.scene.collection.children.link(studio)

def move_to(obj, collection):
    for c in list(obj.users_collection):
        c.objects.unlink(obj)
    collection.objects.link(obj)

def material(name, color, roughness=.72):
    m = bpy.data.materials.new(name)
    m.diffuse_color = (*color, 1)
    m.use_nodes = True
    bsdf = m.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value = (*color, 1)
    bsdf.inputs['Roughness'].default_value = roughness
    return m

cortex = material('Cortex | warm ivory, untextured', (.57, .39, .29))
cerebellum_mat = material('Cerebellum | warm ivory', (.48, .32, .24))
stem_mat = material('Brainstem | warm ivory', (.53, .36, .27))

def sculpt_ellipsoid(name, center, axes, seed, mat, kind='cortex'):
    segments, rings = (256, 160) if kind == 'cortex' else (128, 80)
    verts, faces = [], []
    for j in range(1, rings):
        phi = math.pi*j/rings
        for i in range(segments):
            theta = 2*math.pi*i/segments
            n = Vector((math.sin(phi)*math.cos(theta), math.sin(phi)*math.sin(theta), math.cos(phi)))
            p = Vector((axes[0]*n.x, axes[1]*n.y, axes[2]*n.z))
            if kind == 'cortex':
                # Flatten each medial wall so the two halves read as one organ
                # with a narrow fissure, rather than two separate oval lobes.
                hemisphere = 1 if center[0] > 0 else -1
                if n.x * hemisphere < 0:
                    p.x = hemisphere * -axes[0] * math.tanh(3*abs(n.x))/math.tanh(3)
                # Domain-warped zero contours cut broad winding sulci into the
                # closed cortex surface, instead of laying tubes on a sphere.
                q = p + Vector((seed, .2*seed, -.3*seed))
                warp = noise.noise_vector(q*2.2, noise_basis='PERLIN_ORIGINAL')
                x, y, z = p + warp*.32
                f = (math.sin(12*x + 1.8*math.sin(4.5*y) + .8*math.sin(5*z))
                     + .70*math.sin(11*y + 1.6*math.sin(5*z) + .8*math.cos(5*x))
                     + .52*math.sin(12*z + 1.6*math.cos(4*x) + .7*math.sin(5*y)))
                cut = math.exp(-((f/.34)**2))
                # A deep long lateral fissure gives the fold field a readable
                # large-scale landmark even when rendered at 96 pixels.
                side = max(0., abs(n.x)-.40)/.60
                lateral = .072*side*math.exp(-((p.z+.20+.09*math.sin(3*p.y))/.055)**2)
                d = .025 - .105*cut - lateral
                # Keep the medial face narrow and clearly separated.
                normal = Vector((n.x/axes[0], n.y/axes[1], n.z/axes[2])).normalized()
                p += normal*d
                if n.x * hemisphere > 0:
                    p.x *= .94 + .06*(n.z+1)/2
            else:
                # Cerebellar folia: deliberately coarser than anatomy for pixels.
                f = math.sin(34*p.z + 1.3*math.sin(4*p.y) + .7*math.sin(5*p.x))
                d = -.034*math.exp(-((f/.36)**2))
                p += n*d
            verts.append(tuple(p + Vector(center)))
    top = len(verts)
    verts.append((center[0], center[1], center[2]+axes[2]))
    bottom = len(verts)
    verts.append((center[0], center[1], center[2]-axes[2]))
    for j in range(rings-2):
        for i in range(segments):
            a=j*segments+i; b=j*segments+(i+1)%segments
            faces.append((a, a+segments, b+segments, b))
    for i in range(segments):
        faces.append((top, i, (i+1)%segments))
        a=(rings-2)*segments+i
        b=(rings-2)*segments+(i+1)%segments
        faces.append((bottom,b,a))
    mesh=bpy.data.meshes.new(name+' mesh')
    mesh.from_pydata(verts,[],faces)
    mesh.update()
    obj=bpy.data.objects.new(name,mesh)
    asset.objects.link(obj)
    obj.data.materials.append(mat)
    for poly in mesh.polygons:
        poly.use_smooth=True
    bpy.context.view_layer.objects.active=obj
    obj.select_set(True)
    # Fix orientation and retain an editable high-resolution base mesh.
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.mesh.normals_make_consistent(inside=False)
    bpy.ops.object.mode_set(mode='OBJECT')
    smooth=obj.modifiers.new('Soften sculpt sampling','SMOOTH')
    smooth.factor=.65
    smooth.iterations=3
    dec=obj.modifiers.new('Game mesh | adjustable simplification','DECIMATE')
    dec.ratio=.32 if kind=='cortex' else .38
    obj.select_set(False)
    return obj

left=sculpt_ellipsoid('Brain.Left',(-.575,0,.16),(.555,1.12,.79),1.9,cortex)
right=sculpt_ellipsoid('Brain.Right',(.575,0,.16),(.555,1.12,.79),3.8,cortex)
sculpt_ellipsoid('Cerebellum.Left',(-.31,.64,-.49),(.40,.47,.31),0,cerebellum_mat,'folia')
sculpt_ellipsoid('Cerebellum.Right',(.31,.64,-.49),(.40,.47,.31),0,cerebellum_mat,'folia')
bpy.ops.mesh.primitive_uv_sphere_add(segments=32, ring_count=20, location=(0,.40,-.72))
stem=bpy.context.object
stem.name='Brainstem'
stem.scale=(.19,.23,.37)
stem.rotation_euler.x=-.28
bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
stem.data.materials.append(stem_mat)
for p in stem.data.polygons:
    p.use_smooth=True

root=bpy.data.objects.new('Brain | move or animate this',None)
asset.objects.link(root)
root.empty_display_type='CIRCLE'
root.empty_display_size=1.35
for obj in list(asset.objects):
    if obj != root:
        obj.parent=root

def aim(obj, target=(0,0,0)):
    obj.rotation_euler=(Vector(target)-obj.location).to_track_quat('-Z','Y').to_euler()

def light(name, pos, energy, size, color):
    data=bpy.data.lights.new(name,'AREA')
    data.energy=energy; data.shape='DISK'; data.size=size; data.color=color
    obj=bpy.data.objects.new(name,data); studio.objects.link(obj)
    obj.location=pos; aim(obj)

light('Key | upper left',(-3,-4,6),520,3.0,(1,.88,.75))
light('Fill | soft cool',(4,-1,2),150,4,(.73,.85,1))
light('Rim | rear',(1,4,4),650,2.5,(1,.79,.60))
bpy.ops.object.camera_add(location=(3.3,-4.8,3.2))
camera=bpy.context.object; camera.name='Camera | asset inspection'; move_to(camera,studio)
camera.data.type='ORTHO'; camera.data.ortho_scale=3.5; aim(camera,(0,0,-.02))
scene=bpy.context.scene
scene.camera=camera
scene.render.engine='CYCLES'
scene.cycles.samples=40
scene.cycles.use_denoising=True
scene.world.color=(.13,.13,.13)
scene.render.resolution_x=800; scene.render.resolution_y=800; scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG'
scene.render.film_transparent=True
scene.view_settings.view_transform='AgX'

bpy.ops.object.select_all(action='DESELECT')
for obj in asset.objects:
    obj.select_set(True)
bpy.context.view_layer.objects.active=left
scene['Asset notes']='Original stylized brain. Front = -Y, up = +Z. Deep sulci are real geometry. Five meshes; animate parent empty. Studio excluded from GLB.'
scene['Pixel target']='96–128 px. Inspect broad sulci and central longitudinal fissure at gameplay scale.'
notes=bpy.data.texts.new('README - Brain asset')
notes.write('BRAIN / procedural original\n\nTwo hemispheres, two cerebellar lobes and a short brainstem.\nAll wrinkles are actual geometry; no texture dependencies.\nThe Decimate modifiers remain editable.\nFront: -Y / Up: +Z. Parent: Brain | move or animate this.\nGLB exports only the BRAIN collection, with modifiers applied.\nPreview lights/camera are in STUDIO.\nRebuild: Blender --background --python scripts/build_brain.py\n')
for screen in bpy.data.screens:
    for area in screen.areas:
        if area.type=='VIEW_3D':
            area.spaces.active.region_3d.view_distance=4.5
            area.spaces.active.region_3d.view_location=Vector((0,0,0))
            area.spaces.active.region_3d.view_rotation=camera.rotation_euler.to_quaternion()
            area.spaces.active.shading.type='SOLID'
            area.spaces.active.shading.light='STUDIO'
            area.spaces.active.shading.color_type='MATERIAL'
            area.spaces.active.shading.show_cavity=True
            area.spaces.active.shading.cavity_type='BOTH'

bpy.context.preferences.filepaths.save_version=0
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'brain.blend'))
bpy.ops.export_scene.gltf(filepath=str(OUT/'brain.glb'),export_format='GLB',use_selection=True,export_apply=True)
stats={}
deps=bpy.context.evaluated_depsgraph_get()
for obj in asset.objects:
    if obj.type=='MESH':
        evaluated=obj.evaluated_get(deps)
        m=evaluated.to_mesh(); m.calc_loop_triangles()
        stats[obj.name]=len(m.loop_triangles)
        evaluated.to_mesh_clear()
print('BRAIN_TRIANGLES',stats,'TOTAL',sum(stats.values()),flush=True)
for name,position in [('hero',(3.3,-4.8,3.2)),('side',(4.8,-.6,1.2)),('top',(0,-.2,6)),('rear',(2.7,4.8,1.8))]:
    camera.location=position; aim(camera,(0,0,-.02))
    scene.render.filepath=str(PREVIEWS/(name+'.png'))
    bpy.ops.render.render(write_still=True)
camera.location=(3.3,-4.8,3.2); aim(camera,(0,0,-.02))
scene.render.resolution_x=128; scene.render.resolution_y=128
scene.render.filepath=str(PREVIEWS/'pixel128.png')
bpy.ops.render.render(write_still=True)
print('BRAIN_COMPLETE',flush=True)
